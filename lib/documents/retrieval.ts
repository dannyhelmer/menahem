// Document Intelligence Phase 2: retrieval over document_chunks instead of
// loading a whole document into the prompt. Two distinct search modes,
// because they answer genuinely different questions -- semantic search
// finds passages RELATED to a query and will confidently skip an exact
// literal phrase if it's worded unusually, which is exactly backwards for
// an exhaustive-recall request like "every mention of economic
// development." Exact/full-text search is what actually answers that
// question completely; semantic search is what answers "what does this
// document say about X."
import { ensureSchema } from "@/lib/db/schema";
import { sql } from "@/lib/db/client";
import { embedText, isEmbeddingConfigured, toVectorLiteral } from "@/lib/ai/embeddings";

export interface RetrievedChunk {
  pageNumber: number;
  // Only set for a chunk from a non-paginated document (DOCX/TXT/MD) --
  // null for a PDF chunk, which is cited by page number only.
  lineStart: number | null;
  lineEnd: number | null;
  text: string;
}

interface ChunkRow {
  page_number: number;
  line_start: number | null;
  line_end: number | null;
  text_content: string;
}

function toRetrievedChunk(row: ChunkRow): RetrievedChunk {
  return { pageNumber: row.page_number, lineStart: row.line_start, lineEnd: row.line_end, text: row.text_content };
}

const EXHAUSTIVE_SEARCH_RE =
  /\bevery mention\b|\ball mentions\b|\bevery instance\b|\ball instances\b|\bevery occurrence\b|\ball occurrences\b|\bfind (?:all|every)\b|\bshow (?:me )?every\b/i;
const EXHAUSTIVE_SEARCH_STEM_RE =
  /^(?:show me |find |list )?(?:every|all)\s+(?:mentions?|instances?|occurrences?)\s+of\s+/i;
// Trailing filler that names the document itself rather than the actual
// search topic -- "every mention of X in this document/file/PDF" must
// search for X, not for "X AND document" (plainto_tsquery ANDs every
// non-stopword term together, and "document"/"file"/"pdf" are common
// enough in a natural question but not in the matched passages themselves,
// so leaving them in silently zeroes out real matches).
const TRAILING_DOCUMENT_REFERENCE_RE = /\s+(?:in|within|throughout)\s+(?:this|the)\s+(?:document|file|pdf|text|report)\b.*$/i;

export function wantsExhaustiveSearch(query: string): boolean {
  return EXHAUSTIVE_SEARCH_RE.test(query);
}

// "Show me every mention of economic development in this document" ->
// "economic development" -- strips both the leading instruction phrasing
// and trailing document-reference filler so the full-text query searches
// for the actual topic alone.
export function extractSearchTerm(query: string): string {
  const stripped = query
    .replace(EXHAUSTIVE_SEARCH_STEM_RE, "")
    .replace(TRAILING_DOCUMENT_REFERENCE_RE, "")
    .trim()
    .replace(/[?.!]+$/, "");
  return stripped.length > 0 ? stripped : query;
}

// "Exhaustive" still needs a ceiling -- a pathological case (the search
// term appears in nearly every chunk) shouldn't return literally unbounded
// rows into the prompt.
const EXACT_MATCH_LIMIT = 500;

export async function exactSearchDocument(documentId: string, userId: string, query: string): Promise<RetrievedChunk[]> {
  await ensureSchema();
  // phraseto_tsquery requires the terms adjacent and in order -- the right
  // match for "every mention of economic development" (the phrase as
  // written), not just chunks where "economic" and "development" happen to
  // co-occur unrelated to each other. Falls back to plainto_tsquery (a
  // looser AND-of-terms match) only if the phrase match finds nothing, so
  // an unusual phrasing in the source document still gets found rather
  // than reporting zero mentions that are actually there.
  const phraseRows = (await sql`
    SELECT dc.page_number, dc.line_start, dc.line_end, dc.text_content
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE dc.document_id = ${documentId} AND d.user_id = ${userId}
      AND to_tsvector('english', dc.text_content) @@ phraseto_tsquery('english', ${query})
    ORDER BY dc.page_number, dc.chunk_index
    LIMIT ${EXACT_MATCH_LIMIT}
  `) as ChunkRow[];
  if (phraseRows.length > 0) return phraseRows.map(toRetrievedChunk);

  const looseRows = (await sql`
    SELECT dc.page_number, dc.line_start, dc.line_end, dc.text_content
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE dc.document_id = ${documentId} AND d.user_id = ${userId}
      AND to_tsvector('english', dc.text_content) @@ plainto_tsquery('english', ${query})
    ORDER BY dc.page_number, dc.chunk_index
    LIMIT ${EXACT_MATCH_LIMIT}
  `) as ChunkRow[];
  return looseRows.map(toRetrievedChunk);
}

const SEMANTIC_MATCH_LIMIT = 10;

export async function semanticSearchDocument(documentId: string, userId: string, query: string): Promise<RetrievedChunk[]> {
  if (!isEmbeddingConfigured()) return [];
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return [];

  await ensureSchema();
  const vectorLiteral = toVectorLiteral(queryEmbedding);
  const rows = (await sql`
    SELECT dc.page_number, dc.line_start, dc.line_end, dc.text_content
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE dc.document_id = ${documentId} AND d.user_id = ${userId} AND dc.embedding IS NOT NULL
    ORDER BY dc.embedding <=> ${vectorLiteral}::vector
    LIMIT ${SEMANTIC_MATCH_LIMIT}
  `) as ChunkRow[];
  return rows.map(toRetrievedChunk);
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  mode: "exact" | "semantic" | "none";
}

// The single entry point the chat route calls -- decides exact vs.
// semantic from the query's own shape, with exact search as a safety-net
// fallback when semantic search is unavailable (no embeddings configured)
// or comes back empty (e.g. the document has chunks with no embedding yet).
export async function retrieveRelevantChunks(documentId: string, userId: string, query: string): Promise<RetrievalResult> {
  if (wantsExhaustiveSearch(query)) {
    const chunks = await exactSearchDocument(documentId, userId, extractSearchTerm(query));
    return { chunks, mode: chunks.length > 0 ? "exact" : "none" };
  }

  const semanticChunks = await semanticSearchDocument(documentId, userId, query);
  if (semanticChunks.length > 0) return { chunks: semanticChunks, mode: "semantic" };

  const exactChunks = await exactSearchDocument(documentId, userId, query);
  return { chunks: exactChunks, mode: exactChunks.length > 0 ? "exact" : "none" };
}

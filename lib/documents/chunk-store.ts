import { ensureSchema } from "@/lib/db/schema";
import { sql } from "@/lib/db/client";
import { toVectorLiteral } from "@/lib/ai/embeddings";
import type { DocumentChunk } from "./chunk";

// `embeddings[i]` corresponds to `chunks[i]` -- null entries (embeddings
// not configured, or that specific embedding call failed) are stored as a
// NULL embedding column, which full-text/exact search doesn't need at all
// and semantic search simply skips (see lib/documents/retrieval.ts).
export async function saveDocumentChunks(
  documentId: string,
  chunks: DocumentChunk[],
  embeddings: (number[] | null)[],
): Promise<void> {
  await ensureSchema();
  if (chunks.length === 0) return;

  await sql.transaction((tx) =>
    chunks.map((chunk, i) => {
      const vectorLiteral = embeddings[i] ? toVectorLiteral(embeddings[i]!) : null;
      return tx`
        INSERT INTO document_chunks
          (document_id, page_number, line_start, line_end, chunk_index, text_content, embedding)
        VALUES (
          ${documentId}, ${chunk.pageNumber}, ${chunk.lineStart}, ${chunk.lineEnd}, ${chunk.chunkIndex},
          ${chunk.text}, ${vectorLiteral}::vector
        )
      `;
    }),
  );
}

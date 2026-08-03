import { randomUUID } from "node:crypto";
import { ensureSchema } from "@/lib/db/schema";
import { sql } from "@/lib/db/client";
import type { DocumentPage, StoredDocument } from "./types";

interface DocumentRow {
  id: string;
  project_id: string | null;
  filename: string;
  size_bytes: string;
  uploaded_at: string;
  summary: string;
  paginated: boolean;
}

interface DocumentPageRow {
  page_number: number;
  text_content: string;
}

function toDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    projectId: row.project_id,
    filename: row.filename,
    sizeBytes: Number(row.size_bytes),
    uploadedAt: row.uploaded_at,
    summary: row.summary,
    paginated: row.paginated,
  };
}

export async function listDocuments(projectId: string, userId: string): Promise<StoredDocument[]> {
  await ensureSchema();
  const rows = (await sql`
    SELECT id, project_id, filename, size_bytes, uploaded_at, summary, paginated
    FROM documents WHERE project_id = ${projectId} AND user_id = ${userId}
    ORDER BY uploaded_at DESC
  `) as DocumentRow[];
  return rows.map(toDocument);
}

export async function getDocument(id: string, userId: string): Promise<StoredDocument | null> {
  await ensureSchema();
  const rows = (await sql`
    SELECT id, project_id, filename, size_bytes, uploaded_at, summary, paginated
    FROM documents WHERE id = ${id} AND user_id = ${userId}
  `) as DocumentRow[];
  return rows[0] ? toDocument(rows[0]) : null;
}

// Whole-document flat text -- a denormalized convenience copy (joined from
// document_pages at save time), for callers that genuinely don't care about
// page/line boundaries, like whole-document summary generation. Never the
// source of truth for a citation -- use getDocumentPages for that.
export async function getDocumentText(id: string, userId: string): Promise<string | null> {
  await ensureSchema();
  const rows = (await sql`SELECT text_content FROM documents WHERE id = ${id} AND user_id = ${userId}`) as {
    text_content: string;
  }[];
  return rows[0]?.text_content ?? null;
}

// The real, page-bounded (PDF) or whole-document-as-one-entry (DOCX/TXT/MD
// -- see StoredDocument.paginated) text this document was actually stored
// with. Empty array for a document uploaded before Phase 1 (no
// document_pages rows exist yet -- callers should fall back to
// getDocumentText and must not cite a page number for it).
export async function getDocumentPages(id: string, userId: string): Promise<DocumentPage[]> {
  await ensureSchema();
  const rows = (await sql`
    SELECT dp.page_number, dp.text_content
    FROM document_pages dp
    JOIN documents d ON d.id = dp.document_id
    WHERE dp.document_id = ${id} AND d.user_id = ${userId}
    ORDER BY dp.page_number
  `) as DocumentPageRow[];
  return rows.map((row) => ({ pageNumber: row.page_number, text: row.text_content }));
}

export async function getDocumentFile(id: string, userId: string): Promise<Buffer | null> {
  await ensureSchema();
  const rows = (await sql`SELECT file_data FROM documents WHERE id = ${id} AND user_id = ${userId}`) as {
    file_data: string;
  }[];
  if (!rows[0]) return null;
  return Buffer.from(rows[0].file_data, "base64");
}

// `pages` is the real extraction result: one entry per real PDF page, or a
// single entry (pageNumber 1) for a non-paginated format (DOCX/TXT/MD --
// see `paginated`). The document row and every page row are written in one
// atomic transaction (the id is generated client-side so the page inserts
// don't need to read back a RETURNING value from the first statement --
// Neon's HTTP driver only supports non-interactive transactions, so
// statements can't depend on each other's results).
export async function saveDocument(
  userId: string,
  fields: { projectId: string | null; filename: string; summary: string },
  fileBuffer: Buffer,
  pages: DocumentPage[],
  paginated: boolean,
): Promise<StoredDocument> {
  await ensureSchema();
  const id = randomUUID();
  const textContent = pages.map((page) => page.text).join("\n\n");

  const results = await sql.transaction((tx) => [
    tx`
      INSERT INTO documents (id, user_id, project_id, filename, size_bytes, summary, file_data, text_content, paginated)
      VALUES (
        ${id}, ${userId}, ${fields.projectId}, ${fields.filename}, ${fileBuffer.byteLength}, ${fields.summary},
        ${fileBuffer.toString("base64")}, ${textContent}, ${paginated}
      )
      RETURNING id, project_id, filename, size_bytes, uploaded_at, summary, paginated
    `,
    ...pages.map(
      (page) =>
        tx`
          INSERT INTO document_pages (document_id, page_number, text_content)
          VALUES (${id}, ${page.pageNumber}, ${page.text})
        `,
    ),
  ]);

  return toDocument((results[0] as DocumentRow[])[0]);
}

export async function deleteDocument(id: string, userId: string): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM documents WHERE id = ${id} AND user_id = ${userId}`;
}

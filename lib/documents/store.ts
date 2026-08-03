import { ensureSchema } from "@/lib/db/schema";
import { sql } from "@/lib/db/client";
import type { StoredDocument } from "./types";

interface DocumentRow {
  id: string;
  project_id: string | null;
  filename: string;
  size_bytes: string;
  uploaded_at: string;
  summary: string;
}

function toDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    projectId: row.project_id,
    filename: row.filename,
    sizeBytes: Number(row.size_bytes),
    uploadedAt: row.uploaded_at,
    summary: row.summary,
  };
}

export async function listDocuments(projectId: string, userId: string): Promise<StoredDocument[]> {
  await ensureSchema();
  const rows = (await sql`
    SELECT id, project_id, filename, size_bytes, uploaded_at, summary
    FROM documents WHERE project_id = ${projectId} AND user_id = ${userId}
    ORDER BY uploaded_at DESC
  `) as DocumentRow[];
  return rows.map(toDocument);
}

export async function getDocument(id: string, userId: string): Promise<StoredDocument | null> {
  await ensureSchema();
  const rows = (await sql`
    SELECT id, project_id, filename, size_bytes, uploaded_at, summary
    FROM documents WHERE id = ${id} AND user_id = ${userId}
  `) as DocumentRow[];
  return rows[0] ? toDocument(rows[0]) : null;
}

export async function getDocumentText(id: string, userId: string): Promise<string | null> {
  await ensureSchema();
  const rows = (await sql`SELECT text_content FROM documents WHERE id = ${id} AND user_id = ${userId}`) as {
    text_content: string;
  }[];
  return rows[0]?.text_content ?? null;
}

export async function getDocumentFile(id: string, userId: string): Promise<Buffer | null> {
  await ensureSchema();
  const rows = (await sql`SELECT file_data FROM documents WHERE id = ${id} AND user_id = ${userId}`) as {
    file_data: string;
  }[];
  if (!rows[0]) return null;
  return Buffer.from(rows[0].file_data, "base64");
}

export async function saveDocument(
  userId: string,
  fields: { projectId: string | null; filename: string; summary: string },
  fileBuffer: Buffer,
  text: string,
): Promise<StoredDocument> {
  await ensureSchema();
  const rows = (await sql`
    INSERT INTO documents (user_id, project_id, filename, size_bytes, summary, file_data, text_content)
    VALUES (
      ${userId}, ${fields.projectId}, ${fields.filename}, ${fileBuffer.byteLength}, ${fields.summary},
      ${fileBuffer.toString("base64")}, ${text}
    )
    RETURNING id, project_id, filename, size_bytes, uploaded_at, summary
  `) as DocumentRow[];
  return toDocument(rows[0]);
}

export async function deleteDocument(id: string, userId: string): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM documents WHERE id = ${id} AND user_id = ${userId}`;
}

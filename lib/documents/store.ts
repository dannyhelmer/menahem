import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, ensureDir, readJsonFile, writeJsonFileAtomic } from "@/lib/storage/json-file";
import type { StoredDocument } from "./types";

const DOCUMENTS_DIR = path.join(DATA_DIR, "documents");
const INDEX_PATH = path.join(DOCUMENTS_DIR, "index.json");
const FILES_DIR = path.join(DOCUMENTS_DIR, "files");
const TEXT_DIR = path.join(DOCUMENTS_DIR, "text");

function filePath(id: string): string {
  return path.join(FILES_DIR, `${id}.pdf`);
}

function textPath(id: string): string {
  return path.join(TEXT_DIR, `${id}.txt`);
}

async function loadIndex(): Promise<StoredDocument[]> {
  return readJsonFile<StoredDocument[]>(INDEX_PATH, []);
}

async function saveIndex(documents: StoredDocument[]): Promise<void> {
  await writeJsonFileAtomic(INDEX_PATH, documents);
}

export async function listDocuments(projectId: string): Promise<StoredDocument[]> {
  const documents = await loadIndex();
  return documents
    .filter((d) => d.projectId === projectId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function getDocument(id: string): Promise<StoredDocument | null> {
  const documents = await loadIndex();
  return documents.find((d) => d.id === id) ?? null;
}

export async function getDocumentText(id: string): Promise<string | null> {
  try {
    return await readFile(textPath(id), "utf-8");
  } catch {
    return null;
  }
}

export async function getDocumentFile(id: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath(id));
  } catch {
    return null;
  }
}

export async function saveDocument(
  fields: { projectId: string; filename: string; summary: string },
  pdfBuffer: Buffer,
  text: string,
): Promise<StoredDocument> {
  const id = randomUUID();
  await ensureDir(FILES_DIR);
  await ensureDir(TEXT_DIR);
  await writeFile(filePath(id), pdfBuffer);
  await writeFile(textPath(id), text, "utf-8");

  const document: StoredDocument = {
    id,
    projectId: fields.projectId,
    filename: fields.filename,
    sizeBytes: pdfBuffer.byteLength,
    uploadedAt: new Date().toISOString(),
    summary: fields.summary,
  };

  const documents = await loadIndex();
  documents.push(document);
  await saveIndex(documents);
  return document;
}

export async function deleteDocument(id: string): Promise<void> {
  const documents = await loadIndex();
  await saveIndex(documents.filter((d) => d.id !== id));
  try {
    await unlink(filePath(id));
  } catch {
    // already gone -- fine
  }
  try {
    await unlink(textPath(id));
  } catch {
    // already gone -- fine
  }
}

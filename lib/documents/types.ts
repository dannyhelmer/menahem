export interface StoredDocument {
  id: string;
  // Absent for a document attached directly in the chat composer (not part
  // of any Political Workspace project).
  projectId: string | null;
  filename: string;
  sizeBytes: number;
  uploadedAt: string;
  summary: string;
}

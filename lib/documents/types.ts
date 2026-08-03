export interface StoredDocument {
  id: string;
  // Absent for a document attached directly in the chat composer (not part
  // of any Political Workspace project).
  projectId: string | null;
  filename: string;
  sizeBytes: number;
  uploadedAt: string;
  summary: string;
  // True only for PDFs, where page_number in document_pages is a real page
  // number extracted from the source file. False for DOCX/TXT/MD (which
  // have no real page concept) AND for documents uploaded before Phase 1
  // (which have no document_pages rows at all). Callers must never present
  // a page-number citation for a document where this is false.
  paginated: boolean;
}

// One real page (PDF) or, for a non-paginated format, the whole document as
// a single entry (pageNumber 1) -- see StoredDocument.paginated.
export interface DocumentPage {
  pageNumber: number;
  text: string;
}

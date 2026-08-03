// Splits a document_pages row into retrieval-sized chunks -- always
// derived from Phase 1's real page boundaries, never re-deriving locators
// from scratch. A PDF page chunks by character budget (its citation unit is
// the page number, so there's no finer real locator to preserve within a
// page). A non-paginated page (DOCX/TXT/MD -- the whole document as one
// document_pages row, see lib/documents/types.ts) chunks by whole LINES, so
// line_start/line_end are always real line numbers, never a mid-line cut.
import type { DocumentPage } from "./types";

const CHUNK_CHAR_BUDGET = 1500;
const CHAR_CHUNK_OVERLAP = 200;
const LINE_CHUNK_OVERLAP = 2;

export interface DocumentChunk {
  pageNumber: number;
  chunkIndex: number;
  text: string;
  // Only set for chunks from a non-paginated document -- see
  // StoredDocument.paginated. Null for PDF chunks (cited by page only).
  lineStart: number | null;
  lineEnd: number | null;
}

function chunkByCharacters(text: string): string[] {
  if (text.length <= CHUNK_CHAR_BUDGET) return [text];
  const pieces: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_CHAR_BUDGET, text.length);
    pieces.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - CHAR_CHUNK_OVERLAP;
  }
  return pieces;
}

function chunkByLines(text: string): { text: string; lineStart: number; lineEnd: number }[] {
  const lines = text.split("\n");
  if (lines.length === 0) return [];

  const pieces: { text: string; lineStart: number; lineEnd: number }[] = [];
  let start = 0; // 0-indexed into `lines`
  while (start < lines.length) {
    let end = start; // inclusive, 0-indexed
    let charCount = 0;
    while (end < lines.length && (charCount === 0 || charCount + lines[end].length <= CHUNK_CHAR_BUDGET)) {
      charCount += lines[end].length + 1;
      end += 1;
    }
    end -= 1; // last included line, 0-indexed

    pieces.push({
      text: lines.slice(start, end + 1).join("\n"),
      lineStart: start + 1, // 1-indexed, matches buildLineNumberedDocumentContext's numbering
      lineEnd: end + 1,
    });

    if (end >= lines.length - 1) break;
    start = Math.max(start + 1, end + 1 - LINE_CHUNK_OVERLAP);
  }
  return pieces;
}

export function chunkPage(page: DocumentPage, paginated: boolean): DocumentChunk[] {
  if (paginated) {
    return chunkByCharacters(page.text).map((text, chunkIndex) => ({
      pageNumber: page.pageNumber,
      chunkIndex,
      text,
      lineStart: null,
      lineEnd: null,
    }));
  }
  return chunkByLines(page.text).map((piece, chunkIndex) => ({
    pageNumber: page.pageNumber,
    chunkIndex,
    text: piece.text,
    lineStart: piece.lineStart,
    lineEnd: piece.lineEnd,
  }));
}

export function chunkDocument(pages: DocumentPage[], paginated: boolean): DocumentChunk[] {
  return pages.flatMap((page) => chunkPage(page, paginated));
}

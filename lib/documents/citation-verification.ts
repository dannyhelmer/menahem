// Document Intelligence Phase 3/5: mechanical verification that a page or
// line citation the model made for an uploaded document was one it could
// actually have seen. Phase 1 guaranteed every locator STORED is real;
// Phase 2 guaranteed every locator SHOWN to the model is real; this phase
// closes the remaining gap -- a citation to a real page the model never
// actually saw this turn (e.g. a page that exists in the document but
// wasn't part of what Phase 2's retrieval fetched, or wasn't within the
// whole-document budget) is exactly as unverifiable as a fabricated one,
// even though the page number itself is real. Never generated from
// memory: checked against the literal set of pages/line-ranges that were
// placed in this specific request's prompt.

export interface DocumentCitationContext {
  // A human-readable description used only in the notice text if a
  // citation fails verification -- a single filename for one document, or
  // a description like "the workspace's documents" when context.ts (Phase
  // 5) merges shown locators across every document in a project.
  filename: string;
  // Real page numbers actually shown to the model this turn. Checked
  // unconditionally (not gated behind a "this document is paginated"
  // flag) -- a page citation is exactly as wrong whether it names a real
  // page the model never saw, or names ANY page for a document that has
  // no real pages at all (this set would simply be empty then, so every
  // page citation correctly fails). This also means a workspace context
  // mixing PDFs and text files is checked correctly in one pass: page
  // citations against the union of shown PDF pages, line citations
  // against the union of shown text line-ranges, simultaneously.
  shownPages: Set<number>;
  // Real line ranges actually shown to the model this turn -- checked as
  // an interval (a cited range must fall WITHIN a shown range), not
  // simple membership, since citations are ranges rather than single
  // values.
  shownLineRanges: { start: number; end: number }[];
}

export interface DocumentCitationIssue {
  type: "unverified_page" | "unverified_line";
  detail: string;
}

const PAGE_CITATION_RE = /\bpages?\s+(\d+)(?:\s*[-–—]\s*(\d+))?/gi;
const LINE_CITATION_RE = /\blines?\s+(\d+)(?:\s*[-–—]\s*(\d+))?/gi;

// A citation spanning an implausibly large range is more likely an
// unrelated number pattern ("pages 1-1000000 of history") than a real
// page/line citation -- skipped rather than flagged, to avoid false
// positives on unrelated text.
const MAX_PLAUSIBLE_PAGE_SPAN = 50;
const MAX_PLAUSIBLE_LINE_SPAN = 500;

function isLineRangeShown(start: number, end: number, shown: { start: number; end: number }[]): boolean {
  return shown.some((range) => start >= range.start && end <= range.end);
}

// Checked against ONLY this specific turn's shown pages/lines -- not
// "is this a real page somewhere in the document" (Phase 1 already
// guarantees that for anything actually stored), but "could the model
// have actually seen this."
export function verifyDocumentCitations(
  responseText: string,
  context: DocumentCitationContext,
): DocumentCitationIssue[] {
  const issues: DocumentCitationIssue[] = [];
  const seen = new Set<string>();

  const addIssue = (issue: DocumentCitationIssue) => {
    const key = `${issue.type}:${issue.detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  for (const match of responseText.matchAll(PAGE_CITATION_RE)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (end < start || end - start > MAX_PLAUSIBLE_PAGE_SPAN) continue;
    for (let page = start; page <= end; page++) {
      if (!context.shownPages.has(page)) {
        addIssue({
          type: "unverified_page",
          detail: `Cited "page ${page}" for "${context.filename}" was not among the pages actually shown to the model this turn.`,
        });
      }
    }
  }

  for (const match of responseText.matchAll(LINE_CITATION_RE)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (end < start || end - start > MAX_PLAUSIBLE_LINE_SPAN) continue;
    if (!isLineRangeShown(start, end, context.shownLineRanges)) {
      addIssue({
        type: "unverified_line",
        detail: `Cited "lines ${start}-${end}" for "${context.filename}" was not within any line range actually shown to the model this turn.`,
      });
    }
  }

  return issues;
}

// Merges multiple documents' shown-locator sets into one context for the
// mechanical check -- used when several documents contributed retrieved
// chunks to the same response (Phase 5's workspace-wide retrieval). This
// necessarily loses per-document precision (it can't catch "the right page
// number, but attributed to the wrong file"), but still catches the core
// hallucination case: a page or line citation that was never shown for ANY
// of the documents this turn.
export function mergeDocumentCitationContexts(
  contexts: DocumentCitationContext[],
  description: string,
): DocumentCitationContext | null {
  if (contexts.length === 0) return null;
  const shownPages = new Set<number>();
  const shownLineRanges: { start: number; end: number }[] = [];
  for (const context of contexts) {
    for (const page of context.shownPages) shownPages.add(page);
    shownLineRanges.push(...context.shownLineRanges);
  }
  return { filename: description, shownPages, shownLineRanges };
}

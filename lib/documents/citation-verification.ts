// Document Intelligence Phase 3: mechanical verification that a page or
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
  filename: string;
  paginated: boolean;
  // Real page numbers actually shown to the model this turn (paginated
  // documents only -- empty for a non-paginated document).
  shownPages: Set<number>;
  // Real line ranges actually shown to the model this turn (non-paginated
  // documents only) -- checked as an interval (a cited range must fall
  // WITHIN a shown range), not simple membership, since citations are
  // ranges rather than single values.
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

  if (context.paginated) {
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
  } else {
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
  }

  return issues;
}

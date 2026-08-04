import { describe, it, expect } from "vitest";
import { mergeDocumentCitationContexts, verifyDocumentCitations, type DocumentCitationContext } from "./citation-verification";

const paginatedContext: DocumentCitationContext = {
  filename: "budget.pdf",
  shownPages: new Set([1, 2, 3]),
  shownLineRanges: [],
};

const lineContext: DocumentCitationContext = {
  filename: "notes.txt",
  shownPages: new Set(),
  shownLineRanges: [
    { start: 1, end: 50 },
    { start: 200, end: 250 },
  ],
};

describe("verifyDocumentCitations (paginated documents)", () => {
  it("finds no issues when every cited page was actually shown", () => {
    const issues = verifyDocumentCitations("According to page 1, spending rose. See also page 3.", paginatedContext);
    expect(issues).toEqual([]);
  });

  it("flags a page number that was never shown to the model", () => {
    const issues = verifyDocumentCitations("According to page 287, spending rose.", paginatedContext);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("unverified_page");
    expect(issues[0].detail).toContain("page 287");
    expect(issues[0].detail).toContain("budget.pdf");
  });

  it("flags every unshown page in a cited range, not just the first", () => {
    // shown pages are 1-3; a "pages 2-5" citation should flag 4 and 5 but not 2/3
    const issues = verifyDocumentCitations("See pages 2-5 for details.", paginatedContext);
    expect(issues).toHaveLength(2);
    expect(issues.some((i) => i.detail.includes("page 4"))).toBe(true);
    expect(issues.some((i) => i.detail.includes("page 5"))).toBe(true);
  });

  it("does not flag a page citation for a page range wholly within what was shown", () => {
    const issues = verifyDocumentCitations("See pages 1-3 for details.", paginatedContext);
    expect(issues).toEqual([]);
  });

  it("dedupes repeated citations of the same unverified page", () => {
    const issues = verifyDocumentCitations("Page 99 says X. Page 99 also says Y.", paginatedContext);
    expect(issues).toHaveLength(1);
  });

  it("ignores implausibly large ranges rather than flooding with issues", () => {
    const issues = verifyDocumentCitations("pages 1-1000000", paginatedContext);
    expect(issues).toEqual([]);
  });

  it("finds no issues in a response with no page citations at all", () => {
    const issues = verifyDocumentCitations("The budget increased significantly this year.", paginatedContext);
    expect(issues).toEqual([]);
  });

  it("flags a line citation for a document with no shown line ranges at all", () => {
    // paginatedContext has an empty shownLineRanges -- any line citation
    // against it is unverifiable by construction, and should be caught,
    // not silently ignored the way an earlier "paginated" flag used to.
    const issues = verifyDocumentCitations("See lines 10-20 for details.", paginatedContext);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("unverified_line");
  });
});

describe("verifyDocumentCitations (non-paginated documents)", () => {
  it("finds no issues when a cited line range falls within a shown range", () => {
    const issues = verifyDocumentCitations("See lines 10-20 for the relevant note.", lineContext);
    expect(issues).toEqual([]);
  });

  it("flags a line range outside every shown range", () => {
    const issues = verifyDocumentCitations("See lines 300-310 for the relevant note.", lineContext);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("unverified_line");
    expect(issues[0].detail).toContain("lines 300-310");
  });

  it("flags a line range that only partially overlaps a shown range", () => {
    // shown range is 1-50; a citation of 45-60 spills past what was shown
    const issues = verifyDocumentCitations("See lines 45-60.", lineContext);
    expect(issues).toHaveLength(1);
  });

  it("flags a page citation for a document with no shown pages at all", () => {
    // lineContext has an empty shownPages -- a page citation against it is
    // unverifiable by construction. This is a real improvement over the
    // earlier design: previously page checks were skipped entirely for a
    // non-paginated document, which meant a hallucinated page citation for
    // a DOCX/TXT/MD file was never caught at all.
    const issues = verifyDocumentCitations("See page 5 for details.", lineContext);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("unverified_page");
  });
});

describe("mergeDocumentCitationContexts (Phase 5: workspace-wide)", () => {
  it("returns null for an empty list", () => {
    expect(mergeDocumentCitationContexts([], "the workspace's documents")).toBeNull();
  });

  it("unions shown pages and line ranges across multiple documents", () => {
    const merged = mergeDocumentCitationContexts([paginatedContext, lineContext], "the workspace's documents");
    expect(merged).not.toBeNull();
    expect(merged!.shownPages).toEqual(new Set([1, 2, 3]));
    expect(merged!.shownLineRanges).toEqual([
      { start: 1, end: 50 },
      { start: 200, end: 250 },
    ]);
  });

  it("verifies citations correctly against the merged, multi-document context", () => {
    const merged = mergeDocumentCitationContexts([paginatedContext, lineContext], "the workspace's documents")!;
    // page 2 was shown (via paginatedContext) and lines 10-20 were shown
    // (via lineContext) -- both should verify cleanly against the merge.
    const issues = verifyDocumentCitations("See page 2 and lines 10-20 for details.", merged);
    expect(issues).toEqual([]);
  });

  it("still flags a citation unverifiable against every merged document", () => {
    const merged = mergeDocumentCitationContexts([paginatedContext, lineContext], "the workspace's documents")!;
    const issues = verifyDocumentCitations("See page 999 for details.", merged);
    expect(issues).toHaveLength(1);
  });
});

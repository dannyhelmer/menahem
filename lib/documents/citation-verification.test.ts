import { describe, it, expect } from "vitest";
import { verifyDocumentCitations, type DocumentCitationContext } from "./citation-verification";

const paginatedContext: DocumentCitationContext = {
  filename: "budget.pdf",
  paginated: true,
  shownPages: new Set([1, 2, 3]),
  shownLineRanges: [],
};

const lineContext: DocumentCitationContext = {
  filename: "notes.txt",
  paginated: false,
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

  it("never flags a page citation for a non-paginated document (page checks are skipped entirely)", () => {
    const issues = verifyDocumentCitations("See page 5 for details.", lineContext);
    expect(issues).toEqual([]);
  });
});

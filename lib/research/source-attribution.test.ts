import { describe, it, expect } from "vitest";
import {
  enforceSectionCitationScope,
  findFabricatedCitations,
  hasOfficialCitation,
  isSourceReferenced,
  scanAndReplaceCitations,
} from "./source-attribution";

describe("findFabricatedCitations", () => {
  const retrieved = [{ url: "https://www.ilga.gov/Legislation/BillStatus?DocNum=3129" }, { url: "https://legislature.vermont.gov/bill/status/2026/H.847" }];

  it("returns nothing when every cited URL was actually retrieved", () => {
    const text = "Per (https://www.ilga.gov/Legislation/BillStatus?DocNum=3129), the bill passed.";
    expect(findFabricatedCitations(text, retrieved)).toEqual([]);
  });

  it("flags a URL that was never retrieved -- the confirmed Florida hallucination case", () => {
    const text = "See [Florida Senate Bill 4](https://www.flsenate.gov/Session/Bill/2016/4).";
    expect(findFabricatedCitations(text, retrieved)).toEqual(["https://www.flsenate.gov/Session/Bill/2016/4"]);
  });

  it("ignores host/www differences and a trailing path slash (not a fabrication)", () => {
    const noQuery = [{ url: "https://www.ilga.gov/Legislation/BillStatus" }];
    const text = "Source: http://ilga.gov/Legislation/BillStatus/";
    expect(findFabricatedCitations(text, noQuery)).toEqual([]);
  });

  it("strips trailing punctuation from a cited URL before comparing", () => {
    const text = "(See https://www.flsenate.gov/Session/Bill/2016/4).";
    expect(findFabricatedCitations(text, retrieved)).toEqual(["https://www.flsenate.gov/Session/Bill/2016/4"]);
  });

  it("de-duplicates a URL cited more than once", () => {
    const text = "https://www.flsenate.gov/Session/Bill/2016/4 and again https://www.flsenate.gov/Session/Bill/2016/4";
    expect(findFabricatedCitations(text, retrieved)).toEqual(["https://www.flsenate.gov/Session/Bill/2016/4"]);
  });

  it("returns nothing when the text cites no URLs at all", () => {
    expect(findFabricatedCitations("No citations here.", retrieved)).toEqual([]);
  });
});

describe("scanAndReplaceCitations", () => {
  it("replaces an invalid markdown link with the exact phrase, leaving valid ones untouched", () => {
    const text = "See [Good Source](https://good.gov/a) and [Bad Source](https://bad.gov/b) for details.";
    const { text: result, replaced } = scanAndReplaceCitations(text, (url) => url === "https://bad.gov/b");
    expect(result).toBe("See [Good Source](https://good.gov/a) and Not verified from retrieved official sources for details.");
    expect(replaced).toEqual([{ url: "https://bad.gov/b", index: text.indexOf("[Bad Source]") }]);
  });

  it("replaces an invalid bare URL in place, leaving trailing punctuation untouched", () => {
    const text = "Per https://bad.gov/b, the bill passed.";
    const { text: result } = scanAndReplaceCitations(text, (url) => url === "https://bad.gov/b");
    expect(result).toBe("Per Not verified from retrieved official sources, the bill passed.");
  });

  it("passes the citation's character index to the predicate", () => {
    const text = "aaaa https://x.gov/1 bbbb https://x.gov/2";
    const seenIndexes: number[] = [];
    scanAndReplaceCitations(text, (_url, index) => {
      seenIndexes.push(index);
      return false;
    });
    expect(seenIndexes).toEqual([text.indexOf("https://x.gov/1"), text.indexOf("https://x.gov/2")]);
  });

  it("leaves text with no citations completely unchanged", () => {
    const text = "No citations here at all.";
    expect(scanAndReplaceCitations(text, () => true).text).toBe(text);
  });
});

describe("enforceSectionCitationScope", () => {
  const virginiaUrl = "https://law.lis.virginia.gov/vacodefull/title18.2/";
  const floridaUrl = "https://www.myfloridalegal.com/statutes/chapter932";
  const sections = [
    { key: "Florida", sources: [{ url: floridaUrl }] },
    { key: "Virginia", sources: [{ url: virginiaUrl }] },
  ];

  it("replaces a source cited in the wrong section (the confirmed Florida/Virginia case)", () => {
    const text =
      `## Florida\n\nGoverned by Florida statute. Sources: [Virginia Code](${virginiaUrl})\n\n` +
      `## Virginia\n\nGoverned by Virginia code. Sources: [Virginia Code](${virginiaUrl})`;
    const { text: result, violations } = enforceSectionCitationScope(text, sections);
    expect(violations).toEqual([{ section: "Florida", url: virginiaUrl }]);
    // The Florida section's citation is replaced...
    expect(result).toContain("## Florida\n\nGoverned by Florida statute. Sources: Not verified from retrieved official sources");
    // ...but the SAME url cited under Virginia's own heading is untouched.
    expect(result).toContain(`## Virginia\n\nGoverned by Virginia code. Sources: [Virginia Code](${virginiaUrl})`);
  });

  it("leaves a citation alone when it's cited under its own section", () => {
    const text = `## Florida\n\nSources: [Florida Statutes](${floridaUrl})\n\n## Virginia\n\nSources: [Virginia Code](${virginiaUrl})`;
    const { text: result, violations } = enforceSectionCitationScope(text, sections);
    expect(violations).toEqual([]);
    expect(result).toBe(text);
  });

  it("fails open (skips validation) for a section whose heading isn't found in the text", () => {
    const text = `## Florida\n\nSources: [Virginia Code](${virginiaUrl})`; // no "## Virginia" heading at all
    const { violations } = enforceSectionCitationScope(text, sections);
    // Virginia's heading is missing entirely, but Florida's IS found, and the
    // Virginia URL cited under Florida's own heading is still a violation.
    expect(violations).toEqual([{ section: "Florida", url: virginiaUrl }]);
  });

  it("returns the text unchanged when no sections are provided", () => {
    const text = "Plain text with no sections.";
    expect(enforceSectionCitationScope(text, [])).toEqual({ text, violations: [] });
  });
});

// Pre-existing behavior, unchanged by this turn's edits -- kept here as a
// smoke test that the file's other exports still work as expected.
describe("isSourceReferenced / hasOfficialCitation", () => {
  it("still matches a source by hostname", () => {
    expect(isSourceReferenced("Per Congress.gov...", { title: "H.R. 1", url: "https://www.congress.gov/bill/1" })).toBe(true);
  });

  it("still requires a government-tier match specifically", () => {
    const sources = [{ title: "News", url: "https://example.com", tier: "news" }];
    expect(hasOfficialCitation("Per Example.com...", sources)).toBe(false);
  });
});

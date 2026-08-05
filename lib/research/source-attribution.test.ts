import { describe, it, expect } from "vitest";
import { findFabricatedCitations, hasOfficialCitation, isSourceReferenced } from "./source-attribution";

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

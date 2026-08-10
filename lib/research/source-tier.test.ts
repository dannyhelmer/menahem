import { describe, it, expect } from "vitest";
import { dedupeByUrl, sourceAuthorityRank, sourceTier } from "./source-tier";

describe("sourceAuthorityRank -- Attorney General classification", () => {
  it("ranks an Attorney General page alongside state agencies -- the confirmed gap", () => {
    // Previously fell to "unclassified" (75), below both state_agency (81)
    // and state_courts (79) -- the requested hierarchy groups "state
    // executive agencies or attorneys general" as one tier.
    const agRank = sourceAuthorityRank("https://oag.ca.gov/privacy/ccpa", "California Attorney General");
    const agencyRank = sourceAuthorityRank("https://dceo.illinois.gov", "Illinois Department of Commerce");
    const courtsRank = sourceAuthorityRank("https://illinoiscourts.gov", "Illinois Supreme Court");
    const statutesRank = sourceAuthorityRank("https://ilga.gov/legislation/ilcs", "Illinois Compiled Statutes");

    expect(agRank).toBe(agencyRank);
    expect(agRank).toBeGreaterThan(courtsRank);
    expect(agRank).toBeLessThan(statutesRank);
  });

  it("still tiers an Attorney General page as government-tier", () => {
    expect(sourceTier("https://oag.ca.gov/privacy/ccpa", "California Attorney General")).toBe("government");
  });
});

describe("dedupeByUrl -- the confirmed 740 ILCS 14/15 five-copies case", () => {
  it("collapses http/https and www/non-www variants of the same URL", () => {
    const items = [
      { url: "http://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=074000140K15", title: "740 ILCS 14/15" },
      { url: "https://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=074000140K15", title: "740 ILCS 14/15" },
      { url: "https://ilga.gov/legislation/ilcs/fulltext.asp?DocName=074000140K15", title: "740 ILCS 14/15" },
    ];
    expect(dedupeByUrl(items)).toHaveLength(1);
  });

  it("collapses two genuinely different URL PATHS for the same document via matching title", () => {
    // The confirmed case exact-URL normalization alone can't catch: the
    // same ILGA statute section served through two entirely different URL
    // patterns on the same site.
    const items = [
      { url: "https://www.ilga.gov/documents/legislation/ilcs/documents/074000140K15.htm", title: "740 ILCS 14/15" },
      { url: "https://www.ilga.gov/legislation/ilcs/documents/074000140K15.htm", title: "740 ILCS 14/15" },
    ];
    expect(dedupeByUrl(items)).toHaveLength(1);
  });

  it("collapses all five confirmed real-world variants down to one", () => {
    const items = [
      { url: "http://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=074000140K15", title: "740 ILCS 14/15" },
      { url: "https://www.ilga.gov/documents/legislation/ilcs/documents/074000140K15.htm", title: "740 ILCS 14/15" },
      { url: "https://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=074000140K15", title: "740 ILCS 14/15" },
      { url: "https://www.ilga.gov/legislation/ilcs/documents/074000140K15.htm", title: "740 ILCS 14/15" },
      { url: "https://ilga.gov/legislation/ilcs/fulltext.asp?DocName=074000140K15", title: "740 ILCS 14/15" },
    ];
    const result = dedupeByUrl(items);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("http://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=074000140K15");
  });

  it("keeps genuinely different documents even when their titles happen to share the same first word", () => {
    const items = [
      { url: "https://ilga.gov/legislation/ilcs/documents/074000140K15.htm", title: "740 ILCS 14/15" },
      { url: "https://ilga.gov/legislation/ilcs/documents/074000140K20.htm", title: "740 ILCS 14/20" },
    ];
    expect(dedupeByUrl(items)).toHaveLength(2);
  });

  it("never collapses distinct documents just because they share a generic placeholder title", () => {
    const items = [
      { url: "https://ilga.gov/Legislation/ILCS/Articles?ActID=3004", title: "-" },
      { url: "https://ilga.gov/Legislation/ILCS/Articles?ActID=9999", title: "-" },
    ];
    expect(dedupeByUrl(items)).toHaveLength(2);
  });

  it("treats items with no title at all as distinct unless their URLs match", () => {
    const items = [{ url: "https://example.gov/a" }, { url: "https://example.gov/b" }];
    expect(dedupeByUrl(items)).toHaveLength(2);
  });

  it("keeps two genuinely unrelated bills distinct -- the confirmed SB3122/HB2838 case", () => {
    const items = [
      { url: "https://ilga.gov/ftp/legislation/104/SB/10400SB3122.htm", title: "SB3122 104TH GENERAL ASSEMBLY" },
      { url: "https://ilga.gov/ftp/legislation/104/HB/10400HB2838.htm", title: "HB2838 104TH GENERAL ASSEMBLY" },
      { url: "https://ilga.gov/legislation/ilcs/documents/074000140K15.htm", title: "740 ILCS 14/15" },
    ];
    expect(dedupeByUrl(items)).toHaveLength(3);
  });
});

import { describe, it, expect } from "vitest";
import { enforceCanonicalDocumentCitation, type CanonicalSourceLike } from "./canonical-citation";

const question = "What does the Illinois Constitution say about the governor's veto power?";

const constitutionSource: CanonicalSourceLike = {
  title: "Illinois Constitution",
  url: "https://lrb.ilga.gov/Commission/lrb/conent.htm",
  tier: "government",
};

const publicActSource: CanonicalSourceLike = {
  title: "Illinois General Assembly - Public Act 104-0003",
  url: "https://www.ilga.gov/legislation/PublicActs/View/104-0003",
  tier: "government",
};

// The confirmed live retrieval set actually contained several distinct
// URL-variant entries for the same Public Act (different protocol/www/
// path casing) -- a real, common consequence of a search provider
// returning the "same" page multiple ways. Each is its own retrieved
// source entry, not a single canonical URL, which is why the fix has to
// work across all of them, not just one exact string.
const publicActVariants: CanonicalSourceLike[] = [
  { title: "Illinois General Assembly - Public Act 104-0003", url: "https://www.ilga.gov/legislation/PublicActs/View/104-0003", tier: "government" },
  { title: "Illinois General Assembly - Public Act 104-0003", url: "https://www.ilga.gov/Legislation/PublicActs/View/104-0003", tier: "government" },
  { title: "Illinois General Assembly - Public Act 104-0003", url: "http://ilga.gov/Legislation/PublicActs/View/104-0003", tier: "government" },
  { title: "Illinois General Assembly - Public Act 104-0003", url: "https://ilga.gov/legislation/PublicActs/View/104-0003", tier: "government" },
];

describe("enforceCanonicalDocumentCitation -- the confirmed real-world case", () => {
  it("replaces a Public Act citation with the actual Constitution citation when the Constitution was retrieved but never cited", () => {
    const text =
      "The Illinois Constitution outlines the governor's veto power primarily in Article IV, Section 9. " +
      "The governor can exercise a regular veto or a line-item veto for appropriation bills " +
      `[Illinois General Assembly - Public Act 104-0003](${publicActVariants[0].url}). ` +
      "The General Assembly can override a veto with a three-fifths majority " +
      `[Illinois General Assembly - Public Act 104-0003](${publicActVariants[2].url}). ` +
      "If not overridden, the bill does not become law " +
      `[Illinois General Assembly - Public Act 104-0003](${publicActVariants[3].url}).`;

    const { text: result, corrections } = enforceCanonicalDocumentCitation(text, question, [constitutionSource, ...publicActVariants]);

    expect(result).not.toContain("Public Act 104-0003");
    expect(result.split(constitutionSource.url).length - 1).toBe(3);
    expect(corrections).toHaveLength(3);
    for (const c of corrections) {
      expect(c.canonicalUrl).toBe(constitutionSource.url);
    }
  });

  it("regression: fails if a Constitution answer's Sources ultimately resolve to a Public Act instead of the Constitution", () => {
    // Simulates the exact user-reported bug end-to-end: the answer body
    // never mentions the Constitution's own URL at all, only Public Act
    // 104-0003, repeated three times with the exact URL variants observed
    // live.
    const text =
      "The Illinois Constitution outlines the governor's veto power primarily in Article IV, Section 9.\n\n" +
      `For further information about the veto procedures: [Illinois General Assembly - Public Act 104-0003](${publicActVariants[0].url})\n` +
      `[Illinois General Assembly - Public Act 104-0003](${publicActVariants[1].url})\n` +
      `[Illinois General Assembly - Public Act 104-0003](${publicActVariants[2].url})`;

    const { text: result } = enforceCanonicalDocumentCitation(text, question, [constitutionSource, ...publicActVariants]);

    // The regression check: a Constitution question's final citations must
    // resolve to the Constitution, never a Public Act, amendment proposal,
    // glossary, or unrelated statute.
    const citedUrls = [...result.matchAll(/\((https?:\/\/[^\s)]+)\)/g)].map((m) => m[1]);
    expect(citedUrls.length).toBeGreaterThan(0);
    for (const url of citedUrls) {
      expect(url).toBe(constitutionSource.url);
    }
  });
});

describe("enforceCanonicalDocumentCitation -- does nothing when already correct", () => {
  it("leaves the text untouched when the Constitution is already cited", () => {
    const text = `The Illinois Constitution establishes veto power in Article IV, Section 9 [Illinois Constitution](${constitutionSource.url}).`;
    const { text: result, corrections } = enforceCanonicalDocumentCitation(text, question, [constitutionSource, publicActSource]);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });
});

describe("enforceCanonicalDocumentCitation -- fails open, never invents a source", () => {
  it("does nothing when the canonical document was never retrieved at all", () => {
    const text = `The Illinois Constitution establishes veto power [Public Act](${publicActSource.url}).`;
    const { text: result, corrections } = enforceCanonicalDocumentCitation(text, question, [publicActSource]);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("does nothing when the question has no canonical target at all", () => {
    const text = `Illinois should adopt stronger consumer protections [source](${publicActSource.url}).`;
    const { text: result, corrections } = enforceCanonicalDocumentCitation(
      text,
      "What should Illinois do about consumer protection in general?",
      [constitutionSource, publicActSource],
    );
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("does nothing when the section doesn't substantively discuss the canonical target's subject", () => {
    // The word "constitution" never appears in this section at all, so
    // there's no basis to conclude the Public Act citation is standing in
    // for the Constitution specifically.
    const text = `The governor recently signed several bills [Public Act](${publicActSource.url}).`;
    const { text: result, corrections } = enforceCanonicalDocumentCitation(text, question, [constitutionSource, publicActSource]);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });
});

describe("enforceCanonicalDocumentCitation -- per-section scoping in multi-part comparisons", () => {
  it("corrects only the Constitution section, leaving a legitimately different section's Public Act citation alone", () => {
    const text =
      "## Illinois Constitution\n\n" +
      `The Illinois Constitution establishes veto power in Article IV, Section 9 [Public Act 104-0003](${publicActSource.url}).\n\n` +
      "## Recent Legislative Amendments\n\n" +
      `Public Act 104-0003 recently amended the Cook County veto override threshold [Public Act 104-0003](${publicActSource.url}).`;

    const { text: result, corrections } = enforceCanonicalDocumentCitation(text, question, [constitutionSource, publicActSource]);

    expect(result).toContain(`## Illinois Constitution\n\nThe Illinois Constitution establishes veto power in Article IV, Section 9 [${constitutionSource.title}](${constitutionSource.url})`);
    // The second section legitimately discusses the Public Act itself
    // (no "constitution" type-signal there) -- untouched.
    expect(result).toContain(`Public Act 104-0003 recently amended the Cook County veto override threshold [Public Act 104-0003](${publicActSource.url})`);
    expect(corrections).toEqual([{ section: "Illinois Constitution", replacedUrl: publicActSource.url, canonicalUrl: constitutionSource.url }]);
  });
});

describe("enforceCanonicalDocumentCitation -- statute regression (not just Constitution)", () => {
  const statuteQuestion = "What does the Illinois statute 740 ILCS 14 require of private entities collecting biometric data?";
  const bipaStatuteSource: CanonicalSourceLike = {
    title: "740 ILCS 14",
    url: "https://www.ilga.gov/documents/legislation/ilcs/documents/074000140k10.htm",
    tier: "government",
  };
  const unrelatedStatuteSource: CanonicalSourceLike = {
    title: "815 ILCS 505 - Consumer Fraud Act",
    url: "https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=1093",
    tier: "government",
  };

  it("replaces an unrelated ILCS statute citation with the actual 740 ILCS 14 citation", () => {
    const text = `The Illinois statute 740 ILCS 14 requires written consent [815 ILCS 505](${unrelatedStatuteSource.url}).`;
    const { text: result, corrections } = enforceCanonicalDocumentCitation(text, statuteQuestion, [
      bipaStatuteSource,
      unrelatedStatuteSource,
    ]);
    expect(result).toContain(bipaStatuteSource.url);
    expect(result).not.toContain(unrelatedStatuteSource.url);
    expect(corrections).toHaveLength(1);
  });
});

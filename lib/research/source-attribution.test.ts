import { describe, it, expect } from "vitest";
import {
  enforcePrimarySourceCitation,
  enforceSectionCitationScope,
  findFabricatedCitations,
  hasOfficialCitation,
  hasUnusedOfficialSource,
  isSourceReferenced,
  scanAndReplaceCitations,
  stripPlaceholderLinks,
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

describe("stripPlaceholderLinks", () => {
  it("flattens a placeholder wrapped in link syntax to plain text", () => {
    const text = "Innocent owner protections: [Source](Not verified from retrieved official sources).";
    const { text: result, count } = stripPlaceholderLinks(text);
    expect(result).toBe("Innocent owner protections: Not verified from retrieved official sources.");
    expect(count).toBe(1);
  });

  it("flattens any non-URL href, not just the exact phrase (the model may invent its own wording)", () => {
    const text = "See [citation](no official source found) for details.";
    const { text: result, count } = stripPlaceholderLinks(text);
    expect(result).toBe("See Not verified from retrieved official sources for details.");
    expect(count).toBe(1);
  });

  it("leaves a genuine http(s) markdown link untouched", () => {
    const text = "Per [Florida Statutes](https://www.flsenate.gov/Laws/Statutes/932), the burden is on the state.";
    const { text: result, count } = stripPlaceholderLinks(text);
    expect(result).toBe(text);
    expect(count).toBe(0);
  });

  it("leaves text with no links at all unchanged", () => {
    const text = "Not verified from retrieved official sources.";
    expect(stripPlaceholderLinks(text)).toEqual({ text, count: 0 });
  });
});

describe("hasUnusedOfficialSource", () => {
  it("is true when the pool has an official source but none made it into the used set -- the confirmed BIPA case", () => {
    const allSources = [{ tier: "government" }, { tier: "general" }];
    const usedSources = [{ tier: "general" }];
    expect(hasUnusedOfficialSource(allSources, usedSources)).toBe(true);
  });

  it("is false when an official source IS among the used set", () => {
    const allSources = [{ tier: "government" }, { tier: "general" }];
    const usedSources = [{ tier: "government" }];
    expect(hasUnusedOfficialSource(allSources, usedSources)).toBe(false);
  });

  it("is false when the pool never had an official source at all", () => {
    const allSources = [{ tier: "general" }, { tier: "news" }];
    const usedSources = [{ tier: "general" }];
    expect(hasUnusedOfficialSource(allSources, usedSources)).toBe(false);
  });

  it("is false when nothing was retrieved at all", () => {
    expect(hasUnusedOfficialSource([], [])).toBe(false);
  });
});

describe("enforcePrimarySourceCitation", () => {
  const officialSource = {
    title: "Illinois General Assembly - Bill Status of HB4809",
    url: "https://ilga.gov/Legislation/BillStatus?DocNum=4809",
    tier: "government",
  };
  const secondarySource = {
    title: "LegiScan - IL HB4809",
    url: "https://legiscan.com/IL/bill/HB4809/2025",
    tier: "general",
  };

  it("attaches the official source when only a secondary source is cited -- the confirmed validation case", () => {
    const text = "HB4809 would require data brokers to register annually [LegiScan](https://legiscan.com/IL/bill/HB4809/2025).";
    const { text: result, corrections } = enforcePrimarySourceCitation(text, [
      { key: "", sources: [officialSource, secondarySource] },
    ]);

    expect(result).toContain(officialSource.url);
    // The secondary source is preserved, not removed.
    expect(result).toContain(secondarySource.url);
    expect(corrections).toEqual([{ section: "(single section)", url: officialSource.url }]);
  });

  it("does nothing when the official source is already cited", () => {
    const text = `HB4809 would require data brokers to register [Illinois General Assembly](${officialSource.url}).`;
    const { text: result, corrections } = enforcePrimarySourceCitation(text, [
      { key: "", sources: [officialSource, secondarySource] },
    ]);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("does nothing when no official source was retrieved at all", () => {
    const text = `Per [LegiScan](${secondarySource.url}), the bill was introduced.`;
    const { text: result, corrections } = enforcePrimarySourceCitation(text, [{ key: "", sources: [secondarySource] }]);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("does nothing when no secondary source is cited either -- nothing relied on a lesser source", () => {
    const text = "This response cites nothing at all yet.";
    const { text: result, corrections } = enforcePrimarySourceCitation(text, [
      { key: "", sources: [officialSource, secondarySource] },
    ]);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("does not attach an official source about a DIFFERENT law even though it's also tier government -- the confirmed BIPA case", () => {
    // Confirmed live: for a question about Illinois's BIPA (740 ILCS 14),
    // retrieval also returned the Right to Privacy in the Workplace Act
    // (820 ILCS 55) -- a real, genuinely different Illinois statute, also
    // tier "government". Attaching it would have been a NEW
    // misattribution introduced by the very fix meant to prevent one.
    const wrongOfficialSource = {
      title: "Right to Privacy in the Workplace Act",
      url: "https://labor.illinois.gov/laws-rules/conmed/privacy-workplace.html",
      tier: "government",
    };
    const bipaSecondary = {
      title: "BIPA Law: Your Private Biometric Data, Your Employer's Access to It, and Your Rights",
      url: "https://www.forthepeople.com/blog/bipa-law",
      tier: "general",
    };
    const text = `BIPA requires written consent before collecting biometric data ([source](${bipaSecondary.url})).`;
    const { text: result, corrections } = enforcePrimarySourceCitation(text, [
      { key: "", sources: [wrongOfficialSource, bipaSecondary] },
    ]);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("still attaches a topically-relevant official source when a DIFFERENT-subject official source is also present", () => {
    const wrongOfficialSource = {
      title: "Right to Privacy in the Workplace Act",
      url: "https://labor.illinois.gov/laws-rules/conmed/privacy-workplace.html",
      tier: "government",
    };
    const bipaOfficial = {
      title: "Biometric Information Privacy Act - Illinois Compiled Statutes",
      url: "https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=2951",
      tier: "government",
    };
    const bipaSecondary = {
      title: "BIPA Law: Your Private Biometric Data, Your Employer's Access to It, and Your Rights",
      url: "https://www.forthepeople.com/blog/bipa-law",
      tier: "general",
    };
    const text = `BIPA requires written consent before collecting biometric data ([source](${bipaSecondary.url})).`;
    const { text: result, corrections } = enforcePrimarySourceCitation(text, [
      { key: "", sources: [wrongOfficialSource, bipaOfficial, bipaSecondary] },
    ]);
    expect(result).toContain(bipaOfficial.url);
    expect(result).not.toContain(wrongOfficialSource.url);
    expect(corrections).toEqual([{ section: "(single section)", url: bipaOfficial.url }]);
  });

  it("does nothing when there are no sources in context at all", () => {
    const text = "Nothing was retrieved for this question.";
    expect(enforcePrimarySourceCitation(text, [])).toEqual({ text, corrections: [] });
  });

  describe("per-section scoping in multi-part comparisons", () => {
    // Title deliberately uses a longer, more specific distinguishing clause
    // ("Bill Status of HB4809", not just "HB4809") -- a bare bill number is
    // short enough that it coincidentally appears in ordinary prose about
    // the bill itself, which would make isSourceReferenced's title-clause
    // match false-positive on prose that never actually cites this URL.
    const illinoisOfficial = {
      title: "Illinois General Assembly - Bill Status of HB4809",
      url: "https://ilga.gov/BillStatus?4809",
      tier: "government",
    };
    const illinoisSecondary = { title: "LegiScan - HB4809", url: "https://legiscan.com/IL/HB4809", tier: "general" };
    const californiaOfficial = {
      title: "California Legislative Information - SB 362",
      url: "https://leginfo.legislature.ca.gov/SB362",
      tier: "government",
    };
    const californiaSecondary = { title: "Byte Back - Delete Act", url: "https://bytebacklaw.com/delete-act", tier: "general" };

    it("attaches each section's own uncited official source independently, leaving an already-correct section untouched", () => {
      const text =
        "## Illinois\n\n" +
        `HB4809 would require registration [LegiScan](${illinoisSecondary.url}).\n\n` +
        "## California\n\n" +
        `The Delete Act requires registration [California Legislative Information](${californiaOfficial.url}), ` +
        `as also reported by [Byte Back](${californiaSecondary.url}).\n`;

      const { text: result, corrections } = enforcePrimarySourceCitation(text, [
        { key: "Illinois", sources: [illinoisOfficial, illinoisSecondary] },
        { key: "California", sources: [californiaOfficial, californiaSecondary] },
      ]);

      expect(result).toContain(illinoisOfficial.url);
      // California's section already cited its own official source -- no
      // duplicate addition.
      const californiaOccurrences = result.split(californiaOfficial.url).length - 1;
      expect(californiaOccurrences).toBe(1);
      expect(corrections).toEqual([{ section: "Illinois", url: illinoisOfficial.url }]);
    });
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

describe("isSourceReferenced -- does not false-positive on a DIFFERENT source's own cited href (the confirmed SB3122 case)", () => {
  // Confirmed live: citing ONE ilga.gov source's full URL made an entirely
  // unrelated ilga.gov source (SB3122, for a question about a completely
  // different data-broker statute) register as "referenced" too, purely
  // because "ilga.gov" is a substring of whatever URL actually got cited.
  const citedText =
    "740 ILCS 14, also known as BIPA, requires written consent before collecting biometric data " +
    "[740 ILCS 14/15](https://www.ilga.gov/legislation/ilcs/documents/074000140K15.htm).";

  it("does not match an unrelated same-domain source that was never actually named", () => {
    const unrelatedBill = { title: "SB3122 104TH GENERAL ASSEMBLY", url: "https://ilga.gov/ftp/legislation/104/SB/10400SB3122.htm" };
    expect(isSourceReferenced(citedText, unrelatedBill)).toBe(false);
  });

  it("does not match via the unrelated source's own title-clause split on a hyphenated title either", () => {
    const unrelatedBill = {
      title: "Illinois General Assembly - Full Text of SB3122",
      url: "https://www.ilga.gov/Legislation/BillStatus/FullText?GAID=18&DocNum=3122",
    };
    expect(isSourceReferenced(citedText, unrelatedBill)).toBe(false);
  });

  it("still correctly matches the source that WAS actually cited", () => {
    const actuallyCited = { title: "740 ILCS 14/15", url: "https://www.ilga.gov/legislation/ilcs/documents/074000140K15.htm" };
    expect(isSourceReferenced(citedText, actuallyCited)).toBe(true);
  });

  it("still matches via a genuine hostname mention in prose, not embedded in an href, alongside an unrelated cited link", () => {
    const text = "According to Ilga.gov, the statute requires consent [see full text](https://www.ilga.gov/other/page.htm).";
    const namedInProse = { title: "ILGA Overview", url: "https://www.ilga.gov/legislation/ilcs/documents/074000140K15.htm" };
    expect(isSourceReferenced(text, namedInProse)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { canonicalRankBonus, detectCanonicalTarget, matchesCanonicalTarget } from "./canonical-source";

describe("detectCanonicalTarget -- Constitution", () => {
  it("detects a constitution target with Article/Section identifiers -- the confirmed veto-power case", () => {
    const target = detectCanonicalTarget("What does the Illinois Constitution say about the governor's veto power?");
    expect(target?.kind).toBe("constitution");
  });

  it("extracts explicit Article and Section identifiers when stated", () => {
    const target = detectCanonicalTarget("What does Article IV, Section 9 of the Illinois Constitution say?");
    expect(target).toEqual({ kind: "constitution", identifiers: ["article iv", "section 9"] });
  });

  it("still detects the constitution type with no Article/Section given", () => {
    const target = detectCanonicalTarget("What does the constitution say about free speech?");
    expect(target).toEqual({ kind: "constitution", identifiers: [] });
  });
});

describe("detectCanonicalTarget -- statute", () => {
  it("detects an ILCS statute citation", () => {
    const target = detectCanonicalTarget("What does 760 ILCS 14 require of employers?");
    expect(target?.kind).toBe("statute");
    expect(target?.identifiers[0]).toContain("ilcs");
  });

  it("detects a U.S.C. statute citation", () => {
    const target = detectCanonicalTarget("What does 18 U.S.C. 1030 prohibit?");
    expect(target?.kind).toBe("statute");
  });
});

describe("detectCanonicalTarget -- bill text vs bill status", () => {
  it("detects bill_status for a status-shaped question", () => {
    const target = detectCanonicalTarget("What is the current status of HB4809?");
    expect(target).toEqual({ kind: "bill_status", identifiers: ["hb4809"] });
  });

  it("detects bill_text for a provisions-shaped question", () => {
    const target = detectCanonicalTarget("What does HB4809 require of data brokers?");
    expect(target).toEqual({ kind: "bill_text", identifiers: ["hb4809"] });
  });
});

describe("detectCanonicalTarget -- court opinion", () => {
  it("detects a case name alongside court-holding language", () => {
    const target = detectCanonicalTarget("What did the court hold in Rosenbach v. Six Flags?");
    expect(target?.kind).toBe("court_opinion");
    expect(target?.identifiers[0]).toContain("rosenbach");
  });

  it("does not treat a bare capitalized-word pair as a case name without court-hint language", () => {
    const target = detectCanonicalTarget("Compare Illinois v Texas population growth trends.");
    // "Illinois v Texas" matches the pattern, but with no opinion/holding/
    // ruling/court/decision/case language, this shouldn't be misread as a
    // court-opinion request.
    expect(target?.kind).not.toBe("court_opinion");
  });
});

describe("detectCanonicalTarget -- agency record", () => {
  it("detects a named agency plus an action/decision word", () => {
    const target = detectCanonicalTarget("What enforcement action did the Attorney General take against this company?");
    expect(target?.kind).toBe("agency_record");
  });

  it("returns null for a generic question with no document type at all", () => {
    expect(detectCanonicalTarget("What should Illinois do about data privacy in general?")).toBeNull();
  });
});

describe("detectCanonicalTarget -- current officeholder (the confirmed Illinois governor case)", () => {
  it("detects a current-officeholder target for the exact confirmed live query", () => {
    const target = detectCanonicalTarget("Who is the current governor of Illinois?");
    expect(target).toEqual({ kind: "current_officeholder", identifiers: ["governor"] });
  });

  it("detects the same target without the word 'current'", () => {
    const target = detectCanonicalTarget("Who is the governor of Illinois?");
    expect(target?.kind).toBe("current_officeholder");
  });

  it("detects a possessive phrasing", () => {
    const target = detectCanonicalTarget("Who is Illinois's governor?");
    expect(target?.kind).toBe("current_officeholder");
  });

  it("generalizes to a DIFFERENT state and a DIFFERENT office -- not hardcoded to Illinois/governor", () => {
    const target = detectCanonicalTarget("Who is the current attorney general of Texas?");
    expect(target).toEqual({ kind: "current_officeholder", identifiers: ["attorney general"] });
  });

  it("generalizes to a U.S. Senator query", () => {
    const target = detectCanonicalTarget("Who is the current U.S. Senator from California?");
    expect(target?.kind).toBe("current_officeholder");
    expect(target?.identifiers[0]).toContain("senator");
  });

  it("generalizes to a mayor query", () => {
    const target = detectCanonicalTarget("Who's the mayor of Chicago?");
    expect(target?.kind).toBe("current_officeholder");
  });

  it("does not misclassify a question that merely mentions an office without asking who holds it", () => {
    const target = detectCanonicalTarget("What powers does the governor of Illinois have?");
    expect(target?.kind).not.toBe("current_officeholder");
  });
});

describe("matchesCanonicalTarget -- Constitution: excludes amendment proposals, glossaries, and unrelated pages", () => {
  const target = { kind: "constitution" as const, identifiers: [] };

  it("matches the actual constitutional text", () => {
    expect(matchesCanonicalTarget(target, "https://ilga.gov/constitution/", "Illinois Constitution - Article IV", "veto power")).toBe(
      true,
    );
  });

  it("rejects a constitutional-amendment proposal page -- the confirmed contamination case", () => {
    expect(
      matchesCanonicalTarget(
        target,
        "https://ilga.gov/legislation/hjrca1",
        "Proposed Amendment to the Illinois Constitution",
        "",
      ),
    ).toBe(false);
  });

  it("rejects a glossary page that happens to define constitutional terms", () => {
    expect(matchesCanonicalTarget(target, "https://ilga.gov/glossary", "Legislative Glossary of Terms", "constitution, veto")).toBe(
      false,
    );
  });

  it("rejects a page that never mentions the constitution at all", () => {
    expect(matchesCanonicalTarget(target, "https://ilga.gov/legislation/hb4809", "Bill Status of HB4809", "data brokers")).toBe(false);
  });

  it("requires stated Article/Section identifiers to actually appear when specified", () => {
    const withIdentifiers = { kind: "constitution" as const, identifiers: ["article iv", "section 9"] };
    expect(
      matchesCanonicalTarget(withIdentifiers, "https://ilga.gov/constitution/", "Illinois Constitution", "Article IV Section 9 -- veto"),
    ).toBe(true);
    expect(
      matchesCanonicalTarget(withIdentifiers, "https://ilga.gov/constitution/", "Illinois Constitution", "Article I Section 2 -- speech"),
    ).toBe(false);
  });
});

describe("matchesCanonicalTarget -- statute", () => {
  const target = { kind: "statute" as const, identifiers: ["760 ilcs 14"] };

  it("matches the exact statute", () => {
    expect(matchesCanonicalTarget(target, "https://ilga.gov/ilcs", "760 ILCS 14 - Biometric Information Privacy Act", "")).toBe(true);
  });

  it("rejects a different, unrelated statute", () => {
    expect(matchesCanonicalTarget(target, "https://ilga.gov/ilcs", "815 ILCS 505 - Consumer Fraud Act", "")).toBe(false);
  });
});

describe("matchesCanonicalTarget -- bill text vs bill status", () => {
  const textTarget = { kind: "bill_text" as const, identifiers: ["hb4809"] };
  const statusTarget = { kind: "bill_status" as const, identifiers: ["hb4809"] };

  it("matches the official full-text page for bill_text", () => {
    expect(
      matchesCanonicalTarget(
        textTarget,
        "https://www.ilga.gov/Legislation/BillStatus/FullText?GAID=18&DocNum=4809&DocTypeID=HB",
        "Illinois General Assembly - Full Text of HB4809",
        "",
      ),
    ).toBe(true);
  });

  it("does not match the bill-status page for a bill_text target", () => {
    expect(
      matchesCanonicalTarget(
        textTarget,
        "https://ilga.gov/Legislation/BillStatus?DocNum=4809&DocTypeID=HB",
        "Illinois General Assembly - Bill Status of HB4809",
        "",
      ),
    ).toBe(false);
  });

  it("matches the official bill-status page for bill_status", () => {
    expect(
      matchesCanonicalTarget(
        statusTarget,
        "https://ilga.gov/Legislation/BillStatus?DocNum=4809&DocTypeID=HB",
        "Illinois General Assembly - Bill Status of HB4809",
        "",
      ),
    ).toBe(true);
  });

  it("rejects a page about a different bill number", () => {
    expect(
      matchesCanonicalTarget(
        statusTarget,
        "https://ilga.gov/Legislation/BillStatus?DocNum=100&DocTypeID=HB",
        "Illinois General Assembly - Bill Status of HB100",
        "",
      ),
    ).toBe(false);
  });
});

describe("matchesCanonicalTarget -- court opinion", () => {
  const target = { kind: "court_opinion" as const, identifiers: ["rosenbach v six flags"] };

  it("matches the actual opinion", () => {
    expect(
      matchesCanonicalTarget(target, "https://courts.illinois.gov/opinions/2019", "Rosenbach v. Six Flags Entertainment Corp.", ""),
    ).toBe(true);
  });

  it("rejects an unrelated case", () => {
    expect(matchesCanonicalTarget(target, "https://courts.illinois.gov/opinions/2020", "Smith v. Jones", "")).toBe(false);
  });
});

describe("matchesCanonicalTarget -- agency record", () => {
  it("matches when the named agency appears, even with no further identifier", () => {
    const target = { kind: "agency_record" as const, identifiers: ["attorney general"] };
    expect(matchesCanonicalTarget(target, "https://ag.state.il.us/action", "Attorney General Enforcement Action", "")).toBe(true);
  });

  it("rejects a page from an unrelated agency", () => {
    const target = { kind: "agency_record" as const, identifiers: ["attorney general"] };
    expect(matchesCanonicalTarget(target, "https://dol.illinois.gov/action", "Department of Labor Enforcement Action", "")).toBe(false);
  });
});

describe("matchesCanonicalTarget -- current officeholder (the confirmed Illinois governor case)", () => {
  const governorTarget = { kind: "current_officeholder" as const, identifiers: ["governor"] };

  it("rejects the confirmed unrelated page: a state-park trail closure", () => {
    expect(
      matchesCanonicalTarget(
        governorTarget,
        "https://dnr.illinois.gov/closures/starved-rock-trail-improvement.html",
        "Starved Rock Trail Improvement Project",
        "The current closure affects the north trail through spring.",
      ),
    ).toBe(false);
  });

  it("rejects the confirmed unrelated page: a farmers-market homepage", () => {
    expect(
      matchesCanonicalTarget(
        governorTarget,
        "https://agr.illinois.gov/consumers/illinoisproductsfarmersmarket.html",
        "Home",
        "Find current farmers markets across Illinois.",
      ),
    ).toBe(false);
  });

  it("matches a genuine page about the governor", () => {
    expect(
      matchesCanonicalTarget(
        governorTarget,
        "https://www.illinois.gov/government/executive-branch/governor.html",
        "Office of the Governor",
        "JB Pritzker is the current Governor of the State of Illinois.",
      ),
    ).toBe(true);
  });

  it("generalizes to a different office and jurisdiction -- not hardcoded to Illinois/governor", () => {
    const mayorTarget = { kind: "current_officeholder" as const, identifiers: ["mayor"] };
    expect(matchesCanonicalTarget(mayorTarget, "https://www.chicago.gov/city/en/depts/mayor.html", "Office of the Mayor", "")).toBe(
      true,
    );
    expect(
      matchesCanonicalTarget(mayorTarget, "https://www.chicago.gov/city/en/depts/streets.html", "Streets and Sanitation", ""),
    ).toBe(false);
  });

  it("rejects site-wide footer/header boilerplate that mentions the office in the BODY but not the title -- the confirmed round-2 regression", () => {
    // Confirmed live: dnr.illinois.gov's trail-closure page's fetched full
    // page text (not just the search snippet) still contained "governor"
    // because every illinois.gov-family page credits the sitting governor
    // in a global footer. Checking title+body let this page pass as if it
    // were genuinely about the governor; it wasn't.
    expect(
      matchesCanonicalTarget(
        governorTarget,
        "https://dnr.illinois.gov/closures/starved-rock-trail-improvement.html",
        "Starved Rock Trail Improvement Project",
        "The current closure affects the north trail. State of Illinois | Governor JB Pritzker",
      ),
    ).toBe(false);
  });

  it("rejects a multi-word office title satisfied only by two unrelated incidental mentions -- the confirmed Texas AG regression", () => {
    // Confirmed live: a Texas State Law Library cannabis-law guide page
    // matched identifiers=["attorney general"] against title+body because
    // its title contained "General Information" and its body contained
    // unrelated boilerplate like "consult an attorney" -- neither mention
    // had anything to do with the Attorney General. The full phrase
    // "attorney general" never actually appeared anywhere on the page.
    const agTarget = { kind: "current_officeholder" as const, identifiers: ["attorney general"] };
    expect(
      matchesCanonicalTarget(
        agTarget,
        "https://guides.sll.texas.gov/cannabis",
        "General Information - Cannabis & the Law - Guides at Texas State Law Library",
        "For legal advice, consult an attorney. This guide provides general information only.",
      ),
    ).toBe(false);
    expect(
      matchesCanonicalTarget(agTarget, "https://www.texasattorneygeneral.gov/", "Office of the Attorney General | Texas", ""),
    ).toBe(true);
  });
});

describe("canonicalRankBonus", () => {
  it("returns 0 when there is no canonical target at all", () => {
    expect(canonicalRankBonus(null, "https://example.com", "Anything", "")).toBe(0);
  });

  it("does not reward .gov/official-domain status alone -- only an actual match", () => {
    const target = { kind: "constitution" as const, identifiers: [] };
    // A .gov domain that is NOT about the constitution at all.
    expect(canonicalRankBonus(target, "https://ilga.gov/legislation/hb4809", "Bill Status of HB4809", "")).toBe(0);
  });

  it("returns a positive bonus for the actual canonical match", () => {
    const target = { kind: "constitution" as const, identifiers: [] };
    expect(canonicalRankBonus(target, "https://ilga.gov/constitution/", "Illinois Constitution", "veto power")).toBeGreaterThan(0);
  });
});

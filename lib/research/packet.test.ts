import { describe, it, expect } from "vitest";
import { currentIllinoisGeneralAssembly } from "@/lib/intelligence/general-assembly";
import { buildConfidenceReason, computeConfidence, computeExpectedGeneralAssembly, type TieredSource } from "./packet";

function source(tier: TieredSource["tier"], provenance?: TieredSource["provenance"], title?: string): TieredSource {
  return { title: title ?? `a ${tier} source`, url: `https://example.com/${tier}-${Math.random()}`, tier, provenance };
}

describe("computeConfidence -- direct-record claims: a single authoritative primary source can be High", () => {
  // Test 1 (required): one authoritative ILGA source directly verifying a
  // bill's status. Confirmed gap: this used to score only Medium, because
  // High required 2+ total sources regardless of how authoritative the one
  // retrieved source was -- an Illinois General Assembly bill-status page
  // IS the definitive record of a bill's status; a second source doesn't
  // make it more true.
  it("rates High for a single ILGA bill-status page directly verifying a bill's status", () => {
    const ilgaSource = source("government", "web_search", "Illinois General Assembly - Bill Status of HB4809");
    expect(computeConfidence([ilgaSource], false, "direct_record")).toBe("high");
  });

  // Test 2 (required): one statute directly verifying a statutory
  // provision -- same principle, different record type. Statutory text is
  // itself the definitive record of what the statute says.
  it("rates High for a single statute page directly verifying a statutory provision", () => {
    const statuteSource = source("government", "web_search", "760 ILCS 14 - Biometric Information Privacy Act");
    expect(computeConfidence([statuteSource], false, "direct_record")).toBe("high");
  });

  it("rates High for a single court opinion directly verifying the court's holding", () => {
    const opinionSource = source("government", "web_search", "Illinois Supreme Court - Rosenbach v. Six Flags Opinion");
    expect(computeConfidence([opinionSource], false, "direct_record")).toBe("high");
  });

  it("rates High for a single official agency record directly verifying an agency action", () => {
    const agencySource = source("government", "web_search", "Illinois Attorney General - Enforcement Action Notice");
    expect(computeConfidence([agencySource], false, "direct_record")).toBe("high");
  });

  it("still rates Low with no sources at all", () => {
    expect(computeConfidence([], false, "direct_record")).toBe("low");
  });

  it("still does not rate High from secondary sources alone, however many -- a direct record still has to be official", () => {
    const sources = [source("general"), source("news"), source("reference"), source("general")];
    expect(computeConfidence(sources, false, "direct_record")).not.toBe("high");
    expect(computeConfidence(sources, false, "direct_record")).toBe("medium");
  });
});

describe("computeConfidence -- requires_corroboration claims: a single source, even official, isn't automatically enough", () => {
  // Test 3 (required): multiple weak/secondary sources must not
  // automatically produce High, regardless of claim type or how many
  // there are -- source COUNT alone was never a valid proxy for strength.
  it("does NOT rate High from many weak/secondary sources with no official source at all", () => {
    const manySecondary = [source("general"), source("news"), source("reference"), source("general"), source("news")];
    expect(computeConfidence(manySecondary, false, "requires_corroboration")).not.toBe("high");
    expect(computeConfidence(manySecondary, false, "requires_corroboration")).toBe("medium");
  });

  it("does NOT rate High when mostly secondary sources are cited (1 gov / 4 secondary) -- the confirmed original gap", () => {
    const sources = [source("government"), source("general"), source("general"), source("news"), source("reference")];
    expect(computeConfidence(sources, false, "requires_corroboration")).not.toBe("high");
  });

  it("keeps a single official source at Medium -- corroboration is meaningless with only one source", () => {
    expect(computeConfidence([source("government")], false, "requires_corroboration")).toBe("medium");
  });

  it("rates High when official sources make up at least half of what's cited (2 gov / 2 secondary)", () => {
    const sources = [source("government"), source("government"), source("general"), source("news")];
    expect(computeConfidence(sources, false, "requires_corroboration")).toBe("high");
  });

  it("rates High when official sources are the clear majority (3 gov / 1 secondary)", () => {
    const sources = [source("government"), source("government"), source("government"), source("general")];
    expect(computeConfidence(sources, false, "requires_corroboration")).toBe("high");
  });
});

describe("computeConfidence -- directGovHit bypasses claim type entirely", () => {
  it("rates High for a direct gov-data-provider hit regardless of ratio or claim type", () => {
    const sources = [source("government"), source("general"), source("general"), source("general")];
    expect(computeConfidence(sources, true, "requires_corroboration")).toBe("high");
    expect(computeConfidence(sources, true, "direct_record")).toBe("high");
  });
});

describe("computeConfidence -- defaults to direct_record when claimType is omitted", () => {
  it("rates a single official source High by default, matching this app's dominant use case (legal/legislative records)", () => {
    expect(computeConfidence([source("government")], false)).toBe("high");
  });
});

describe("computeConfidence -- test 4: a mixed answer keeps directly-verified legal facts High while unsupported policy claims stay lower", () => {
  // computeConfidence scores one set of sources at a time -- a "mixed
  // answer" (verified legal facts alongside an unsupported policy
  // recommendation) is represented here as what it actually is: two
  // differently-typed claims within the same response, each scored
  // against its own sources and its own claim type. This is the
  // claim-aware behavior the fix is for -- confidence is no longer one
  // number derived from a flat, undifferentiated source count for the
  // whole response.
  const legalFactSource = source("government", "web_search", "Illinois General Assembly - Bill Status of HB4809");
  const policySource1 = source("general", undefined, "A think tank's blog post speculating about future impact");
  const policySource2 = source("news", undefined, "A news article's opinion piece on the policy debate");

  it("the directly-verified legal-fact portion (bill status from ILGA) rates High on its own authoritative source", () => {
    expect(computeConfidence([legalFactSource], false, "direct_record")).toBe("high");
  });

  it("the unsupported policy-recommendation portion (one blog post, no official corroboration) stays Medium, not High", () => {
    expect(computeConfidence([policySource1], false, "requires_corroboration")).toBe("medium");
  });

  it("combining both portions' sources into one requires_corroboration score does not let the legal fact's official source inflate the whole mixed answer to High", () => {
    // If the two claims were wrongly scored together as one undifferentiated
    // pool for a corroboration-requiring topic, one official source diluted
    // by two secondary ones still doesn't reach the 50% ratio needed --
    // confirms the fix doesn't accidentally let a single strong source
    // paper over a response that's mostly unsupported synthesis.
    expect(computeConfidence([legalFactSource, policySource1, policySource2], false, "requires_corroboration")).toBe("medium");
  });

  it("buildConfidenceReason explains the direct-record High as a single authoritative source, not corroboration by others", () => {
    const reason = buildConfidenceReason("high", [legalFactSource], false, "direct_record");
    expect(reason).toContain("A single authoritative primary source directly establishes this.");
  });
});

describe("computeExpectedGeneralAssembly", () => {
  it("defaults to the current GA when the question names no session", () => {
    expect(computeExpectedGeneralAssembly("HB4809", "Illinois", [])).toBe(currentIllinoisGeneralAssembly());
  });

  it("uses the explicit session when the question names exactly one", () => {
    expect(computeExpectedGeneralAssembly("HB4809", "Illinois", [103])).toBe(103);
  });

  it("returns null (no expectation) when the question names two or more sessions -- a cross-session comparison", () => {
    // Confirmed gap: without this, comparing HB4809 across the 103rd and
    // 104th General Assemblies in one question would set the expectation
    // to whichever session sorted first, silently rejecting the other.
    expect(computeExpectedGeneralAssembly("HB4809", "Illinois", [103, 104])).toBeNull();
  });

  it("returns null when there is no bill number at all", () => {
    expect(computeExpectedGeneralAssembly(null, "Illinois", [104])).toBeNull();
  });

  it("returns null for a non-Illinois state", () => {
    expect(computeExpectedGeneralAssembly("HB100", "Texas", [])).toBeNull();
  });

  it("returns null when state is not yet resolved", () => {
    expect(computeExpectedGeneralAssembly("HB4809", null, [])).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { resolveJurisdictionAndState } from "./jurisdiction";
import type { PoliticalIntent } from "./political-intent";

function intentSet(...intents: PoliticalIntent[]): Set<PoliticalIntent> {
  return new Set(intents);
}

describe("resolveJurisdictionAndState", () => {
  it("resolves state jurisdiction for a named state + 'legislature' with no literal 'state' phrase -- the confirmed gap", () => {
    const text =
      "I am a Texas state policymaker. What does the Texas legislature's recent reform of civil asset " +
      "forfeiture law say, and which committee handled it?";
    const result = resolveJurisdictionAndState(text, intentSet());
    expect(result).toEqual({ jurisdiction: "state", state: "Texas" });
  });

  it("resolves state jurisdiction for a named state + 'Attorney General'", () => {
    const result = resolveJurisdictionAndState("What is the Illinois Attorney General's position on this?", intentSet());
    expect(result).toEqual({ jurisdiction: "state", state: "Illinois" });
  });

  it("resolves state jurisdiction for a named state + governor", () => {
    const result = resolveJurisdictionAndState("Did the Florida governor sign the bill?", intentSet());
    expect(result).toEqual({ jurisdiction: "state", state: "Florida" });
  });

  it("resolves state jurisdiction for a named state + an HB/SB-style bill number", () => {
    const result = resolveJurisdictionAndState("What does Virginia SB 1096 do?", intentSet());
    expect(result).toEqual({ jurisdiction: "state", state: "Virginia" });
  });

  it("still resolves via the pre-existing state_legislation intent override when no branch noun is present", () => {
    const result = resolveJurisdictionAndState("Tell me about Georgia state law on this topic.", intentSet("state_legislation"));
    expect(result).toEqual({ jurisdiction: "state", state: "Georgia" });
  });

  it("stays federal for an incidental state mention with no state-branch noun", () => {
    const result = resolveJurisdictionAndState("The president signed a bill affecting Texas farmers.", intentSet());
    expect(result).toEqual({ jurisdiction: "federal", state: null });
  });

  it("resolves state jurisdiction for a named state explicitly compared to federal law, with no branch noun present", () => {
    // The confirmed follow-on gap: this phrasing has no legislature/
    // governor/AG/court/bill-number, so STATE_BRANCH_NOUN_RE alone misses
    // it, but "Illinois's law compare to federal law" is unambiguously
    // also an Illinois question -- needed so classifyJurisdictionRouting's
    // "mixed" scope actually has a state to search alongside federal.
    const result = resolveJurisdictionAndState(
      "How does Illinois's civil asset forfeiture law compare to federal law?",
      intentSet("federal_legislation"),
    );
    expect(result).toEqual({ jurisdiction: "state", state: "Illinois" });
  });

  it("does NOT resolve state jurisdiction for a named state with a federal signal but no comparison framing", () => {
    // Contrast with the case above -- an incidental state mention in a
    // federal-legislation question, with no "compare"/"versus" framing,
    // should stay federal (same rationale as the farmers example below).
    const result = resolveJurisdictionAndState(
      "The federal law signed today mentions funding for Texas infrastructure.",
      intentSet("federal_legislation"),
    );
    expect(result).toEqual({ jurisdiction: "federal", state: null });
  });

  it("still resolves state jurisdiction even when a federal signal is also present -- a mixed question", () => {
    // classifyJurisdictionRouting (source-router.ts) is what decides whether
    // federal sources ALSO belong in a mixed question's search -- this
    // function's job is only to get jurisdiction/state right so Texas's own
    // sources are searched at all.
    const result = resolveJurisdictionAndState(
      "How does the Texas Attorney General's stance compare to federal law?",
      intentSet("federal_legislation"),
    );
    expect(result).toEqual({ jurisdiction: "state", state: "Texas" });
  });

  it("resolves plain federal jurisdiction with no state named", () => {
    const result = resolveJurisdictionAndState("What does H.R. 1 do?", intentSet("federal_legislation"));
    expect(result).toEqual({ jurisdiction: "federal", state: null });
  });

  it("resolves local jurisdiction unaffected by the new override", () => {
    const result = resolveJurisdictionAndState("What did the Chicago city council vote on?", intentSet("local_government"));
    expect(result.jurisdiction).toBe("local");
  });
});

describe("resolveJurisdictionAndState -- Illinois HB/SB and General Assembly session evidence with no state named", () => {
  // Confirmed live gap: this exact question triggered "Which jurisdiction
  // do you mean? Illinois or Federal?" even though "General Assembly" is
  // state-only terminology (Congress never uses it) and "HB4809" is never
  // federal notation (federal bills are always "H.R.").
  it("resolves Illinois for an HB number + explicit General Assembly session, no state named", () => {
    const result = resolveJurisdictionAndState("What happened to HB4809 in the 103rd General Assembly?", intentSet("state_legislation"));
    expect(result).toEqual({ jurisdiction: "state", state: "Illinois" });
  });

  it("resolves Illinois for a bare HB number with no session and no state named", () => {
    const result = resolveJurisdictionAndState("What is the current status of HB4809?", intentSet("state_legislation"));
    expect(result).toEqual({ jurisdiction: "state", state: "Illinois" });
  });

  it("resolves Illinois for a bare SB number with no session and no state named", () => {
    const result = resolveJurisdictionAndState("What is SB3219 about?", intentSet("state_legislation"));
    expect(result).toEqual({ jurisdiction: "state", state: "Illinois" });
  });

  it("resolves Illinois for the same bill compared across two General Assemblies, no state named", () => {
    const result = resolveJurisdictionAndState(
      "Compare HB4809 in the 103rd and 104th General Assemblies.",
      intentSet("state_legislation"),
    );
    expect(result).toEqual({ jurisdiction: "state", state: "Illinois" });
  });

  it("does not override an explicitly different state's own HB number", () => {
    // A different state's own bill number, with that state named, must
    // keep winning -- the Illinois assumption only fills in when NO other
    // state is named at all.
    const result = resolveJurisdictionAndState("What does Texas HB 100 do?", intentSet("state_legislation"));
    expect(result).toEqual({ jurisdiction: "state", state: "Texas" });
  });

  it("resolves Illinois for a General Assembly session reference with no bill number at all", () => {
    const result = resolveJurisdictionAndState("What bills passed the 104th General Assembly?", intentSet());
    expect(result).toEqual({ jurisdiction: "state", state: "Illinois" });
  });

  // Confirmed live gap (round 2): once classifyPoliticalIntents was fixed
  // to recognize a bare ILCS citation as state_legislation, "What does 740
  // ILCS 14 require of private entities collecting biometric data?" fell
  // straight into this SAME "Illinois or Federal?" clarification -- "ILCS"
  // is exactly as state-specific as HB/SB notation (never used for a
  // federal statute or any other state's code), so it already answers the
  // question.
  it("resolves Illinois for a bare ILCS citation with no state named", () => {
    const result = resolveJurisdictionAndState(
      "What does 740 ILCS 14 require of private entities collecting biometric data?",
      intentSet("state_legislation"),
    );
    expect(result).toEqual({ jurisdiction: "state", state: "Illinois" });
  });

  it("resolves Illinois for an ILCS citation with a section symbol", () => {
    const result = resolveJurisdictionAndState("What does 815 ILCS § 505 prohibit?", intentSet("state_legislation"));
    expect(result).toEqual({ jurisdiction: "state", state: "Illinois" });
  });
});

import { describe, it, expect } from "vitest";
import { classifyPoliticalIntents, isPoliticalQuestion } from "./political-intent";

describe("classifyPoliticalIntents / isPoliticalQuestion -- bare 'law(s)'/'statute(s)'", () => {
  it("classifies a bare-law comparison as political -- the confirmed gap", () => {
    // Previously: none of POLITICAL_RE's phrases matched this at all (every
    // other legal-record word had SOME form already; bare "laws" did not),
    // so the whole question fell through as non-political and never reached
    // the government-research pipeline or the research-planning stage.
    const intents = classifyPoliticalIntents("Compare the five strongest state consumer privacy laws.");
    expect(intents.has("political")).toBe(true);
    expect(isPoliticalQuestion(intents)).toBe(true);
  });

  it("classifies a bare 'statute' mention as political", () => {
    const intents = classifyPoliticalIntents("What does this statute actually require?");
    expect(intents.has("political")).toBe(true);
  });

  it("does NOT classify the common physics idiom 'laws of physics' as political", () => {
    const intents = classifyPoliticalIntents("Can you explain the laws of physics to me?");
    expect(intents.has("political")).toBe(false);
    expect(isPoliticalQuestion(intents)).toBe(false);
  });

  it("does NOT classify 'laws of motion' or 'law of gravity' as political", () => {
    expect(classifyPoliticalIntents("Explain Newton's laws of motion.").has("political")).toBe(false);
    expect(classifyPoliticalIntents("What is the law of gravity?").has("political")).toBe(false);
  });

  it("still classifies an ordinary state-law question as political (pre-existing behavior, unaffected)", () => {
    const intents = classifyPoliticalIntents("What does Illinois state law say about this?");
    expect(intents.has("political")).toBe(true);
    expect(intents.has("state_legislation")).toBe(true);
  });
});

describe("classifyPoliticalIntents / isPoliticalQuestion -- bare statute citations (the confirmed 740 ILCS 14 gap)", () => {
  it("classifies a bare ILCS citation as state_legislation -- the confirmed live gap", () => {
    // Confirmed live: "What does 740 ILCS 14 require of private entities
    // collecting biometric data?" matched NO intent at all (no "statute"/
    // "law"/"bill"/"act" word anywhere), so it never reached the
    // government-research pipeline -- the model answered from its own
    // training knowledge with zero retrieval, zero citation, zero
    // confidence rating shown.
    const intents = classifyPoliticalIntents("What does 740 ILCS 14 require of private entities collecting biometric data?");
    expect(intents.has("state_legislation")).toBe(true);
    expect(isPoliticalQuestion(intents)).toBe(true);
  });

  it("classifies a bare U.S.C. citation as federal_legislation", () => {
    const intents = classifyPoliticalIntents("What does 18 U.S.C. 1030 prohibit?");
    expect(intents.has("federal_legislation")).toBe(true);
    expect(isPoliticalQuestion(intents)).toBe(true);
  });

  it("classifies a bare CFR citation as federal_legislation", () => {
    const intents = classifyPoliticalIntents("What does 45 CFR 164.502 require of covered entities?");
    expect(intents.has("federal_legislation")).toBe(true);
  });

  it("classifies an ILCS citation with a section symbol", () => {
    const intents = classifyPoliticalIntents("What does 815 ILCS § 505 prohibit?");
    expect(intents.has("state_legislation")).toBe(true);
  });

  it("does not misclassify an ordinary sentence with unrelated numbers as a statute citation", () => {
    const intents = classifyPoliticalIntents("I bought 14 apples and 740 oranges at the store.");
    expect(intents.has("state_legislation")).toBe(false);
    expect(intents.has("federal_legislation")).toBe(false);
  });
});

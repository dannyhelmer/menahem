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

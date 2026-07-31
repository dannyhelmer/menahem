import { describe, it, expect } from "vitest";
import {
  GROUNDING_INSTRUCTIONS,
  GROUNDED_CATEGORIES,
  isGroundedCategory,
  buildIsolatedMessages,
  buildModelMessages,
  validateEvidence,
  performValidationPass,
} from "./grounding";
import type { ChatMessage } from "./types";

describe("GROUNDING_INSTRUCTIONS", () => {
  it("contains the core grounding rules", () => {
    expect(GROUNDING_INSTRUCTIONS).toContain("GROUNDING RULES");
    expect(GROUNDING_INSTRUCTIONS).toContain("government intelligence platform");
  });

  it("forbids reusing previous assistant responses as evidence", () => {
    expect(GROUNDING_INSTRUCTIONS).toContain("Do NOT reuse factual information from previous assistant responses");
    expect(GROUNDING_INSTRUCTIONS).toContain("Do NOT treat previous assistant messages as evidence");
  });

  it("forbids treating previous user messages as evidence", () => {
    expect(GROUNDING_INSTRUCTIONS).toContain("Do NOT treat previous user messages as evidence");
  });

  it("requires discarding claims with no source", () => {
    expect(GROUNDING_INSTRUCTIONS).toContain("If a claim has no source in the retrieved documents, discard it");
  });

  it("provides the required fallback response for missing evidence", () => {
    expect(GROUNDING_INSTRUCTIONS).toContain(
      "I could not verify this information from the retrieved official sources.",
    );
  });

  it("forbids fabricating funding amounts, sponsors, sections, or policy differences", () => {
    expect(GROUNDING_INSTRUCTIONS).toContain("Never infer, estimate, or fabricate funding amounts, sponsors, sections, or policy differences");
  });

  it("requires every comparison to be supported by both retrieved documents", () => {
    expect(GROUNDING_INSTRUCTIONS).toContain("Every comparison must be supported by both retrieved documents");
  });
});

describe("GROUNDED_CATEGORIES", () => {
  it("includes all retrieval-grounded categories", () => {
    const expected = [
      "deep_research",
      "comparison",
      "federal_legislation",
      "state_legislation",
      "elections",
      "campaign_finance",
      "supreme_court",
      "state_courts",
      "constitution",
      "budget",
      "executive_branch",
      "congress",
      "governor",
      "local_government",
      "regulations",
      "history",
      "web_search",
    ];
    for (const cat of expected) {
      expect(GROUNDED_CATEGORIES.has(cat), `Expected ${cat} to be in GROUNDED_CATEGORIES`).toBe(true);
    }
  });

  it("does NOT include non-retrieval categories", () => {
    expect(GROUNDED_CATEGORIES.has("fast_path")).toBe(false);
    expect(GROUNDED_CATEGORIES.has("math")).toBe(false);
    expect(GROUNDED_CATEGORIES.has("coding")).toBe(false);
    expect(GROUNDED_CATEGORIES.has("creative")).toBe(false);
    expect(GROUNDED_CATEGORIES.has("planning")).toBe(false);
    expect(GROUNDED_CATEGORIES.has("reasoning")).toBe(false);
    expect(GROUNDED_CATEGORIES.has("generic")).toBe(false);
  });
});

describe("isGroundedCategory", () => {
  it("returns true for retrieval-grounded categories", () => {
    expect(isGroundedCategory("comparison")).toBe(true);
    expect(isGroundedCategory("deep_research")).toBe(true);
    expect(isGroundedCategory("federal_legislation")).toBe(true);
    expect(isGroundedCategory("web_search")).toBe(true);
    expect(isGroundedCategory("budget")).toBe(true);
  });

  it("returns false for non-retrieval categories", () => {
    expect(isGroundedCategory("fast_path")).toBe(false);
    expect(isGroundedCategory("math")).toBe(false);
    expect(isGroundedCategory("coding")).toBe(false);
    expect(isGroundedCategory("generic")).toBe(false);
  });
});

describe("buildIsolatedMessages", () => {
  it("returns only system + user message (no previous turns)", () => {
    const systemPrompt = "You are a helpful assistant.";
    const userMessage: ChatMessage = { role: "user", content: "Compare H.R. 1 vs. S. 1" };

    const result = buildIsolatedMessages(systemPrompt, userMessage);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "system", content: systemPrompt });
    expect(result[1]).toEqual(userMessage);
  });

  it("does NOT include any previous conversation turns", () => {
    const systemPrompt = "You are a helpful assistant.";
    const userMessage: ChatMessage = { role: "user", content: "Compare H.R. 1 vs. S. 1" };

    const result = buildIsolatedMessages(systemPrompt, userMessage);

    const assistantMessages = result.filter((m) => m.role === "assistant");
    expect(assistantMessages).toHaveLength(0);
  });
});

describe("buildModelMessages", () => {
  const systemPrompt = "You are a helpful assistant with live data.";
  const previousUserMessage: ChatMessage = { role: "user", content: "Compare the Illinois and federal budgets" };
  const previousAssistantMessage: ChatMessage = {
    role: "assistant",
    content: "The Illinois budget is $50 billion and the federal budget is $6.2 trillion.",
  };
  const currentUserMessage: ChatMessage = { role: "user", content: "Compare H.R. 1 vs. S. 1" };
  const fullHistory: ChatMessage[] = [previousUserMessage, previousAssistantMessage, currentUserMessage];

  describe("when grounded is true (retrieval-grounded query)", () => {
    it("returns only system + current user message", () => {
      const result = buildModelMessages(true, systemPrompt, fullHistory, "Compare H.R. 1 vs. S. 1");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: "system", content: systemPrompt });
      expect(result[1]).toEqual({ role: "user", content: "Compare H.R. 1 vs. S. 1" });
    });

    it("does NOT include previous assistant responses (stale context isolation)", () => {
      const result = buildModelMessages(true, systemPrompt, fullHistory, "Compare H.R. 1 vs. S. 1");

      const allContent = result.map((m) => m.content).join("\n");
      expect(allContent).not.toContain("$50 billion");
      expect(allContent).not.toContain("$6.2 trillion");
      expect(allContent).not.toContain("Illinois budget");
    });

    it("does NOT include previous user messages", () => {
      const result = buildModelMessages(true, systemPrompt, fullHistory, "Compare H.R. 1 vs. S. 1");

      const allContent = result.map((m) => m.content).join("\n");
      expect(allContent).not.toContain("Compare the Illinois and federal budgets");
    });

    it("uses the resolved user text, not the original last message", () => {
      const result = buildModelMessages(true, systemPrompt, fullHistory, "Compare H.R. 1 and S. 1 in the 118th Congress");

      expect(result).toHaveLength(2);
      expect(result[1].content).toBe("Compare H.R. 1 and S. 1 in the 118th Congress");
    });
  });

  describe("when grounded is false (non-retrieval query)", () => {
    it("returns system + full conversation history", () => {
      const result = buildModelMessages(false, systemPrompt, fullHistory, "Compare H.R. 1 vs. S. 1");

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ role: "system", content: systemPrompt });
      expect(result[1]).toEqual(previousUserMessage);
      expect(result[2]).toEqual(previousAssistantMessage);
      expect(result[3]).toEqual(currentUserMessage);
    });

    it("preserves previous assistant responses for conversational context", () => {
      const result = buildModelMessages(false, systemPrompt, fullHistory, "Compare H.R. 1 vs. S. 1");

      const allContent = result.map((m) => m.content).join("\n");
      expect(allContent).toContain("$50 billion");
      expect(allContent).toContain("$6.2 trillion");
    });
  });
});

describe("validateEvidence", () => {
  describe("when no sources and no live data", () => {
    it("flags responses that make factual claims", () => {
      const response =
        "The bill was passed on March 15, 2023 with a vote of 218-202. " +
        "The legislation was signed into law by the President on that date.";
      const issues = validateEvidence(response, [], undefined);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("missing_source");
      expect(issues[0].detail).toContain("without any retrieved sources");
    });

    it("does NOT flag responses that explicitly say they could not verify", () => {
      const response =
        "I could not verify this information from the retrieved official sources. " +
        "No official government source or web search result was found for this question.";
      const issues = validateEvidence(response, [], undefined);

      expect(issues).toHaveLength(0);
    });

    it("does NOT flag short acknowledgments", () => {
      const response = "I don't know.";
      const issues = validateEvidence(response, [], undefined);

      expect(issues).toHaveLength(0);
    });
  });

  describe("when sources and live data are present", () => {
    const liveData =
      "The bill was passed on March 15, 2023 with a vote of 218-202. The state budget is $50,000 million.";
    const sources = [{ title: "Congress.gov", url: "https://congress.gov/bill/118" }];

    it("does NOT flag numbers that appear in the live data", () => {
      const response = "The bill passed with a vote of 218-202 on March 15, 2023.";
      const issues = validateEvidence(response, sources, liveData);

      const unsupportedIssues = issues.filter((i) => i.type === "unsupported_claim");
      expect(unsupportedIssues).toHaveLength(0);
    });

    it("flags numbers that do NOT appear in the live data (stale context leak)", () => {
      const response = "The state budget is $50,000 million and the federal budget is $6,200,000 million.";
      const issues = validateEvidence(response, sources, liveData);

      const unsupportedIssues = issues.filter((i) => i.type === "unsupported_claim");
      expect(unsupportedIssues.length).toBeGreaterThan(0);
      // "6,200,000" is parsed as "200,000" (the "6" is only 1 digit, so the
      // regex starts at "200"). After removing commas, "200000" does not
      // appear in the live data, so it should be flagged.
      expect(unsupportedIssues.some((i) => i.detail.includes("200000"))).toBe(true);
    });

    it("flags quoted sections that do not appear verbatim in the live data", () => {
      const response = 'The bill states: "This is a fabricated quote that does not exist in any source."';
      const issues = validateEvidence(response, sources, liveData);

      const quoteIssues = issues.filter((i) => i.type === "unsupported_claim" && i.detail.includes("Quoted section"));
      expect(quoteIssues).toHaveLength(1);
    });

    it("does NOT flag short quoted sections (under 15 chars)", () => {
      const response = 'The bill says "hello world" and more.';
      const issues = validateEvidence(response, sources, liveData);

      const quoteIssues = issues.filter((i) => i.type === "unsupported_claim" && i.detail.includes("Quoted section"));
      expect(quoteIssues).toHaveLength(0);
    });
  });
});

describe("performValidationPass", () => {
  it("appends a grounding notice when there are missing-source issues", () => {
    const response =
      "The bill was passed on March 15, 2023 with a vote of 218-202. " +
      "The legislation was signed into law by the President on that date.";
    const { response: validatedText, issues } = performValidationPass(response, [], undefined);

    expect(issues.some((i) => i.type === "missing_source")).toBe(true);
    expect(validatedText).toContain("I could not verify this information from the retrieved official sources.");
  });

  it("does NOT append a notice when there are no issues", () => {
    const response = "I could not verify this information from the retrieved official sources.";
    const { response: validatedText, issues } = performValidationPass(response, [], undefined);

    expect(issues).toHaveLength(0);
    expect(validatedText).toBe(response);
  });

  it("does NOT append a duplicate notice if one is already present", () => {
    const response =
      "Some text. I could not verify this information from the retrieved official sources.";
    const { response: validatedText } = performValidationPass(response, [], undefined);

    const noticeCount = (validatedText.match(/I could not verify this information/g) || []).length;
    expect(noticeCount).toBe(1);
  });
});

describe("Context Isolation: Stale Context Leak Prevention", () => {
  // This is the core test for the grounding bug described in the task:
  // "after a state budget comparison, the model incorrectly inserted those
  // budget numbers into a comparison of congressional bills."
  it("prevents budget numbers from a previous conversation leaking into a bill comparison", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Compare the Illinois and federal budgets" },
      {
        role: "assistant",
        content:
          "The Illinois state budget for FY 2024 is $50.2 billion. The federal budget for FY 2024 is $6.2 trillion. " +
          "Illinois spends 40% on education and 25% on healthcare. The federal budget allocates 22% to defense.",
      },
      { role: "user", content: "Compare H.R. 1 vs. S. 1" },
    ];

    const systemPrompt = "You are Menahem. Live data: [congressional bill data]";
    const resolvedUserText = "Compare H.R. 1 vs. S. 1";

    const modelMessages = buildModelMessages(true, systemPrompt, messages, resolvedUserText);

    expect(modelMessages).toHaveLength(2);
    expect(modelMessages[0].role).toBe("system");
    expect(modelMessages[1].role).toBe("user");
    expect(modelMessages[1].content).toBe("Compare H.R. 1 vs. S. 1");

    const allContent = modelMessages.map((m) => m.content).join("\n");
    expect(allContent).not.toContain("$50.2 billion");
    expect(allContent).not.toContain("$6.2 trillion");
    expect(allContent).not.toContain("40% on education");
    expect(allContent).not.toContain("25% on healthcare");
    expect(allContent).not.toContain("22% to defense");
    expect(allContent).not.toContain("Illinois state budget");
    expect(allContent).not.toContain("FY 2024");
  });

  it("prevents previous assistant response content from appearing in grounded model input", () => {
    const staleFact = "The capital of France is Berlin.";
    const messages: ChatMessage[] = [
      { role: "user", content: "What is the capital of France?" },
      { role: "assistant", content: staleFact },
      { role: "user", content: "Compare H.R. 1 vs. S. 1" },
    ];

    const modelMessages = buildModelMessages(true, "system prompt", messages, "Compare H.R. 1 vs. S. 1");

    const allContent = modelMessages.map((m) => m.content).join("\n");
    expect(allContent).not.toContain(staleFact);
    expect(allContent).not.toContain("Berlin");
  });

  it("preserves full history for non-grounded (fast path) messages", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
      { role: "user", content: "Hello" },
    ];

    const modelMessages = buildModelMessages(false, "system prompt", messages, "Hello");

    expect(modelMessages).toHaveLength(4);
    expect(modelMessages[2].content).toBe("Hi there!");
  });
});

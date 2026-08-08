import { describe, it, expect } from "vitest";
import { enforceLegislativeStatusLanguage } from "./legislative-status";

function billText(status: string, overview: string): string {
  return (
    "**Official Title:** Data Broker Registration and Accessible Deletion Mechanism Act\n" +
    "**Bill Number:** HB4809\n" +
    `**Current Status:** ${status}\n` +
    "**Policy Area:** Consumer Protection\n\n" +
    "### Overview\n" +
    overview
  );
}

describe("enforceLegislativeStatusLanguage -- non-enacted statuses get conditional language", () => {
  const cases: { label: string; status: string }[] = [
    { label: "pending", status: "Pending / Referred to Committee" },
    { label: "introduced", status: "Introduced" },
    { label: "passed one chamber", status: "Passed One Chamber" },
    { label: "failed", status: "Failed" },
    { label: "withdrawn", status: "Withdrawn" },
    { label: "re-referred", status: "Re-Referred" },
  ];

  for (const { label, status } of cases) {
    it(`converts present-tense provision verbs to conditional for status: ${label}`, () => {
      const text = billText(status, "HB4809 requires data brokers to register annually with the Attorney General.");
      const { text: result, corrections } = enforceLegislativeStatusLanguage(text);
      expect(result).toContain("HB4809 would require data brokers to register annually");
      expect(corrections).toEqual([{ section: "(single section)", status, verbsCorrected: 1 }]);
    });
  }
});

describe("enforceLegislativeStatusLanguage -- enacted statuses keep present tense", () => {
  const cases = ["Enacted Statute", "Enacted Public Act (Public Act 103-0555)", "Signed into law"];

  for (const status of cases) {
    it(`leaves present-tense provisions untouched for status: ${status}`, () => {
      const text = billText(status, "HB4809 requires data brokers to register annually with the Attorney General.");
      const { text: result, corrections } = enforceLegislativeStatusLanguage(text);
      expect(result).toBe(text);
      expect(corrections).toEqual([]);
    });
  }
});

describe("enforceLegislativeStatusLanguage -- the confirmed real-world cases", () => {
  it("HB4809: converts the exact live-observed compound sentence", () => {
    const text = billText(
      "Pending / Referred to Committee",
      "HB4809 aims to create the Data Broker Registration and Accessible Deletion Mechanism Act. It requires " +
        "data brokers operating in Illinois to register annually with the Attorney General and pay an " +
        "associated fee. The act mandates the creation of a public page to access this registration " +
        "information and imposes civil penalties for noncompliance.",
    );
    const { text: result, corrections } = enforceLegislativeStatusLanguage(text);
    expect(result).toContain("It would require data brokers operating in Illinois to register annually");
    expect(result).toContain("The act would mandate the creation of a public page");
    // "imposes" continues the same sentence via "and" after "mandates".
    expect(result).toContain("and would impose civil penalties for noncompliance");
    expect(corrections[0].verbsCorrected).toBeGreaterThanOrEqual(3);
  });

  it("HB2913: does not over-correct a sentence that's already appropriately hedged", () => {
    const text = billText(
      "Pending / Referred to Committee",
      "HB2913 is similar to HB4809 in that it also seeks to establish requirements for data brokers to " +
        "register with the Attorney General and provide accessible deletion mechanisms.",
    );
    const { text: result } = enforceLegislativeStatusLanguage(text);
    // "seeks to establish" is already a hedge, not present-tense assertion --
    // the mechanical check only fires on the specific verb list, so this
    // sentence legitimately has nothing to correct; confirms it doesn't
    // over-correct sentences that are already appropriately hedged.
    expect(result).toBe(text);
  });
});

describe("enforceLegislativeStatusLanguage -- safety boundaries", () => {
  it("never touches a present-tense fact about the status quo with no explicit bill subject", () => {
    const text = billText("Pending / Referred to Committee", "Illinois currently requires no such registration from data brokers.");
    const { text: result, corrections } = enforceLegislativeStatusLanguage(text);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("does nothing when no Current Status field is present at all", () => {
    const text = "### Overview\nHB4809 requires data brokers to register.";
    const { text: result, corrections } = enforceLegislativeStatusLanguage(text);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("does nothing when there are no provision verbs to correct", () => {
    const text = billText("Pending", "HB4809 is a short bill about data brokers.");
    const { text: result, corrections } = enforceLegislativeStatusLanguage(text);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });
});

describe("enforceLegislativeStatusLanguage -- per-section scoping in multi-part comparisons", () => {
  it("corrects only the pending section, leaving the enacted section's present tense untouched", () => {
    const text =
      "## Illinois\n\n" +
      "**Bill Number:** HB4809\n" +
      "**Current Status:** Pending / Referred to Committee\n\n" +
      "### Overview\nHB4809 requires data brokers to register.\n\n" +
      "## California\n\n" +
      "**Official Title:** California Delete Act\n" +
      "**Current Status:** Enacted Public Act (Chapter 709)\n\n" +
      "### Overview\nThe Delete Act requires data brokers to participate in a centralized deletion platform.\n\n" +
      "It establishes the DROP system for consumers.";

    const { text: result, corrections } = enforceLegislativeStatusLanguage(text);
    expect(result).toContain("HB4809 would require data brokers to register");
    // California's section is enacted -- present tense preserved exactly.
    expect(result).toContain("The Delete Act requires data brokers to participate in a centralized deletion platform");
    expect(result).toContain("It establishes the DROP system for consumers");
    expect(corrections).toEqual([{ section: "Illinois", status: "Pending / Referred to Committee", verbsCorrected: 1 }]);
  });
});

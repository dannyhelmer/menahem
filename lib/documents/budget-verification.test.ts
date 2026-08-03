import { describe, it, expect } from "vitest";
import { verifyBudgetObjectiveFindings } from "./budget-verification";
import type { BudgetAnalysis } from "./budget-analysis";

const analysis: BudgetAnalysis = {
  categoryTotals: [{ category: "Police Overtime", fiscalYear: "FY2027", amount: 4_200_000 }],
  largestCategories: [{ category: "Police Overtime", fiscalYear: "FY2027", amount: 4_200_000 }],
  totalsByYear: [{ fiscalYear: "FY2027", total: 4_200_000 }],
  yearOverYearChanges: [
    {
      category: "Police Overtime",
      fromYear: "FY2026",
      toYear: "FY2027",
      fromAmount: 4_000_000,
      toAmount: 4_200_000,
      dollarChange: 200_000,
      percentChange: 5,
    },
  ],
  biggestYearOverYearChanges: [],
  missingCategories: [],
  spendingPerResident: [],
};

describe("verifyBudgetObjectiveFindings", () => {
  it("finds no issues when every number in Objective Findings matches a computed value", () => {
    const response = "## Objective Findings\nPolice Overtime totaled $4,200,000 in FY2027, a 5% increase from $4,000,000.\n\n## Policy Analysis\nSome text.";
    expect(verifyBudgetObjectiveFindings(response, analysis)).toEqual([]);
  });

  it("flags a number in Objective Findings that doesn't match anything computed", () => {
    const response = "## Objective Findings\nPolice Overtime totaled $9,999,999 in FY2027.\n\n## Policy Analysis\nSome text.";
    const issues = verifyBudgetObjectiveFindings(response, analysis);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("unverified_objective_number");
    expect(issues[0].detail).toContain("9,999,999");
  });

  it("ignores numbers outside the Objective Findings section entirely", () => {
    const response =
      "## Objective Findings\nPolice Overtime totaled $4,200,000.\n\n## Policy Analysis\nSome argue this could reach $9,999,999 eventually.";
    expect(verifyBudgetObjectiveFindings(response, analysis)).toEqual([]);
  });

  it("returns no issues when there is no Objective Findings section at all", () => {
    const response = "Just a plain response with no headed sections mentioning $9,999,999.";
    expect(verifyBudgetObjectiveFindings(response, analysis)).toEqual([]);
  });

  it("ignores small numbers (under 3 digits) even if unmatched", () => {
    const response = "## Objective Findings\nThere are 12 line items and 5 categories.\n\n## Policy Analysis\nMore.";
    expect(verifyBudgetObjectiveFindings(response, analysis)).toEqual([]);
  });

  it("dedupes repeated occurrences of the same unverified number", () => {
    const response = "## Objective Findings\n$9,999,999 appears here. It also appears again: $9,999,999.\n\n## Policy Analysis\nMore.";
    expect(verifyBudgetObjectiveFindings(response, analysis)).toHaveLength(1);
  });
});

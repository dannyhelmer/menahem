import { describe, it, expect } from "vitest";
import { computeBudgetAnalysis } from "./budget-analysis";
import type { FinancialLineItem } from "./budget-extract";

function item(category: string, amount: number, fiscalYear: string | null, pageNumber: number | null = 1): FinancialLineItem {
  return { category, amount, fiscalYear, pageNumber, sourceSnippet: "" };
}

describe("computeBudgetAnalysis: category totals", () => {
  it("sums duplicate (category, fiscalYear) line items instead of treating them as separate totals", () => {
    const analysis = computeBudgetAnalysis([
      item("Police Overtime", 1_000_000, "FY2027"),
      item("Police Overtime", 500_000, "FY2027"),
    ]);
    expect(analysis.categoryTotals).toEqual([{ category: "Police Overtime", fiscalYear: "FY2027", amount: 1_500_000 }]);
  });

  it("keeps the same category in different fiscal years as separate totals", () => {
    const analysis = computeBudgetAnalysis([
      item("Transportation", 40_000_000, "FY2026"),
      item("Transportation", 42_000_000, "FY2027"),
    ]);
    expect(analysis.categoryTotals).toHaveLength(2);
  });
});

describe("computeBudgetAnalysis: largest categories", () => {
  it("ranks categories descending by amount", () => {
    const analysis = computeBudgetAnalysis([
      item("Small Fund", 1_000, "FY2027"),
      item("Transportation", 42_000_000, "FY2027"),
      item("Police", 10_000_000, "FY2027"),
    ]);
    expect(analysis.largestCategories.map((c) => c.category)).toEqual(["Transportation", "Police", "Small Fund"]);
  });
});

describe("computeBudgetAnalysis: year-over-year changes", () => {
  it("computes exact dollar and percentage change for a category present in both years", () => {
    const analysis = computeBudgetAnalysis([
      item("Police Overtime", 4_000_000, "FY2026"),
      item("Police Overtime", 4_200_000, "FY2027"),
    ]);
    expect(analysis.yearOverYearChanges).toEqual([
      {
        category: "Police Overtime",
        fromYear: "FY2026",
        toYear: "FY2027",
        fromAmount: 4_000_000,
        toAmount: 4_200_000,
        dollarChange: 200_000,
        percentChange: 5,
      },
    ]);
  });

  it("does not compute year-over-year changes when more than two fiscal years are present", () => {
    const analysis = computeBudgetAnalysis([
      item("Police", 1_000_000, "FY2025"),
      item("Police", 1_100_000, "FY2026"),
      item("Police", 1_200_000, "FY2027"),
    ]);
    expect(analysis.yearOverYearChanges).toEqual([]);
  });

  it("does not compute year-over-year changes when only one fiscal year is present", () => {
    const analysis = computeBudgetAnalysis([item("Police", 1_000_000, "FY2027")]);
    expect(analysis.yearOverYearChanges).toEqual([]);
  });

  it("ranks biggestYearOverYearChanges by absolute dollar change, not percentage", () => {
    const analysis = computeBudgetAnalysis([
      // Small Fund: 100% increase but tiny dollar amount
      item("Small Fund", 1_000, "FY2026"),
      item("Small Fund", 2_000, "FY2027"),
      // Transportation: 5% increase but a much larger dollar amount
      item("Transportation", 40_000_000, "FY2026"),
      item("Transportation", 42_000_000, "FY2027"),
    ]);
    expect(analysis.biggestYearOverYearChanges[0].category).toBe("Transportation");
  });
});

describe("computeBudgetAnalysis: missing categories (gaps)", () => {
  it("flags a category present in one year but absent in the other", () => {
    const analysis = computeBudgetAnalysis([
      item("Police", 1_000_000, "FY2026"),
      item("Police", 1_100_000, "FY2027"),
      item("Pandemic Relief Fund", 5_000_000, "FY2026"),
      // Pandemic Relief Fund has no FY2027 entry at all
    ]);
    expect(analysis.missingCategories).toEqual([
      { category: "Pandemic Relief Fund", presentInYear: "FY2026", missingInYear: "FY2027" },
    ]);
  });
});

describe("computeBudgetAnalysis: spending per resident", () => {
  it("computes per-resident spending only when a population line item was itself extracted", () => {
    const analysis = computeBudgetAnalysis([
      item("Police", 1_000_000, "FY2027"),
      item("Transportation", 4_000_000, "FY2027"),
      item("Population", 50_000, "FY2027"),
    ]);
    expect(analysis.spendingPerResident).toEqual([
      { fiscalYear: "FY2027", totalSpending: 5_000_000, population: 50_000, perResident: 100 },
    ]);
  });

  it("never computes per-resident spending when no population figure was extracted", () => {
    const analysis = computeBudgetAnalysis([item("Police", 1_000_000, "FY2027")]);
    expect(analysis.spendingPerResident).toEqual([]);
  });

  it("excludes the population line item itself from category totals", () => {
    const analysis = computeBudgetAnalysis([item("Police", 1_000_000, "FY2027"), item("Population", 50_000, "FY2027")]);
    expect(analysis.categoryTotals.map((c) => c.category)).toEqual(["Police"]);
  });

  it("does not misclassify a real budget category that merely contains the word 'population'", () => {
    // A department genuinely named "Population Health Department" has a
    // dollar amount, not a resident count -- treating it as one would
    // divide total spending by $2,000,000 as if that were a number of
    // residents, corrupting every per-resident figure computed from it.
    const analysis = computeBudgetAnalysis([item("Population Health Department", 2_000_000, "FY2027")]);
    expect(analysis.categoryTotals).toEqual([{ category: "Population Health Department", fiscalYear: "FY2027", amount: 2_000_000 }]);
    expect(analysis.spendingPerResident).toEqual([]);
  });

  it("still recognizes common real-world population-figure phrasings", () => {
    const analysis = computeBudgetAnalysis([
      item("Police", 1_000_000, "FY2027"),
      item("Total Population", 50_000, "FY2027"),
    ]);
    expect(analysis.spendingPerResident).toEqual([
      { fiscalYear: "FY2027", totalSpending: 1_000_000, population: 50_000, perResident: 20 },
    ]);
  });
});

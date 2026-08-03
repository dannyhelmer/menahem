// Document Intelligence Phase 4: every number in here is computed in plain
// arithmetic from verified line items (see budget-extract.ts) -- the model
// never performs this math itself. It only narrates results already
// computed here (see the "Objective Findings" instructions in
// app/api/chat/route.ts's buildBudgetAnalysisContext), and
// budget-verification.ts mechanically checks that any number the model
// states in that section actually matches one of these computed values.
import type { FinancialLineItem } from "./budget-extract";

export interface CategoryTotal {
  category: string;
  fiscalYear: string | null;
  amount: number;
}

export interface YearOverYearChange {
  category: string;
  fromYear: string;
  toYear: string;
  fromAmount: number;
  toAmount: number;
  dollarChange: number;
  percentChange: number;
}

export interface MissingCategory {
  category: string;
  presentInYear: string;
  missingInYear: string;
}

export interface BudgetAnalysis {
  // One entry per distinct (category, fiscalYear) pair, amounts summed if
  // the same category appeared more than once for that year.
  categoryTotals: CategoryTotal[];
  // categoryTotals sorted descending by amount, capped to a readable count.
  largestCategories: CategoryTotal[];
  totalsByYear: { fiscalYear: string | null; total: number }[];
  // Only populated when exactly two distinct fiscal years are present --
  // "compare this year's budget with last year's" is well-defined then;
  // with three or more years, which pair to compare is ambiguous, so no
  // YoY figures are fabricated by picking one arbitrarily.
  yearOverYearChanges: YearOverYearChange[];
  biggestYearOverYearChanges: YearOverYearChange[];
  missingCategories: MissingCategory[];
  // Spending per resident -- ONLY computed if a line item's own category
  // literally looks like a population figure (e.g. "Population" or "Total
  // Residents"). Never a general per-capita estimate from an assumed or
  // outside population number that wasn't actually in the document.
  spendingPerResident: { fiscalYear: string | null; totalSpending: number; population: number; perResident: number }[];
}

const POPULATION_CATEGORY_RE = /\b(population|total residents|resident count)\b/i;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeBudgetAnalysis(items: FinancialLineItem[]): BudgetAnalysis {
  const financialItems = items.filter((item) => !POPULATION_CATEGORY_RE.test(item.category));
  const populationItems = items.filter((item) => POPULATION_CATEGORY_RE.test(item.category));

  // Sum duplicate (category, fiscalYear) pairs rather than treating each
  // occurrence as a separate total.
  const totalsMap = new Map<string, CategoryTotal>();
  for (const item of financialItems) {
    const key = `${item.category}::${item.fiscalYear ?? ""}`;
    const existing = totalsMap.get(key);
    if (existing) existing.amount += item.amount;
    else totalsMap.set(key, { category: item.category, fiscalYear: item.fiscalYear, amount: item.amount });
  }
  const categoryTotals = Array.from(totalsMap.values()).map((t) => ({ ...t, amount: round2(t.amount) }));

  const largestCategories = [...categoryTotals].sort((a, b) => b.amount - a.amount).slice(0, 10);

  const yearTotalsMap = new Map<string | null, number>();
  for (const total of categoryTotals) {
    yearTotalsMap.set(total.fiscalYear, (yearTotalsMap.get(total.fiscalYear) ?? 0) + total.amount);
  }
  const totalsByYear = Array.from(yearTotalsMap.entries()).map(([fiscalYear, total]) => ({
    fiscalYear,
    total: round2(total),
  }));

  const distinctYears = Array.from(new Set(categoryTotals.map((t) => t.fiscalYear).filter((y): y is string => y !== null)));

  let yearOverYearChanges: YearOverYearChange[] = [];
  let missingCategories: MissingCategory[] = [];
  if (distinctYears.length === 2) {
    const [yearA, yearB] = distinctYears.sort();
    const byCategoryA = new Map(categoryTotals.filter((t) => t.fiscalYear === yearA).map((t) => [t.category, t.amount]));
    const byCategoryB = new Map(categoryTotals.filter((t) => t.fiscalYear === yearB).map((t) => [t.category, t.amount]));
    const allCategories = new Set([...byCategoryA.keys(), ...byCategoryB.keys()]);

    for (const category of allCategories) {
      const fromAmount = byCategoryA.get(category);
      const toAmount = byCategoryB.get(category);
      if (fromAmount === undefined) {
        missingCategories.push({ category, presentInYear: yearB, missingInYear: yearA });
        continue;
      }
      if (toAmount === undefined) {
        missingCategories.push({ category, presentInYear: yearA, missingInYear: yearB });
        continue;
      }
      const dollarChange = round2(toAmount - fromAmount);
      const percentChange = fromAmount !== 0 ? round2((dollarChange / fromAmount) * 100) : 0;
      yearOverYearChanges.push({ category, fromYear: yearA, toYear: yearB, fromAmount, toAmount, dollarChange, percentChange });
    }
  }

  const biggestYearOverYearChanges = [...yearOverYearChanges]
    .sort((a, b) => Math.abs(b.dollarChange) - Math.abs(a.dollarChange))
    .slice(0, 10);

  const spendingPerResident: BudgetAnalysis["spendingPerResident"] = [];
  for (const popItem of populationItems) {
    const yearTotal = totalsByYear.find((t) => t.fiscalYear === popItem.fiscalYear);
    if (yearTotal && popItem.amount > 0) {
      spendingPerResident.push({
        fiscalYear: popItem.fiscalYear,
        totalSpending: yearTotal.total,
        population: popItem.amount,
        perResident: round2(yearTotal.total / popItem.amount),
      });
    }
  }

  return {
    categoryTotals,
    largestCategories,
    totalsByYear,
    yearOverYearChanges,
    biggestYearOverYearChanges,
    missingCategories,
    spendingPerResident,
  };
}

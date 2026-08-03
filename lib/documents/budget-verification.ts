// Document Intelligence Phase 4: the mechanical half of "the AI should
// explain computed results rather than calculate them itself" -- prompting
// the model not to do its own math (see buildBudgetAnalysisContext in
// app/api/chat/route.ts) is necessary but not sufficient, so this checks
// afterward that every number the model actually wrote in the "Objective
// Findings" section matches one this module's caller actually computed
// (budget-analysis.ts), not a number the model computed or misremembered
// itself. Same pattern as Phase 3's citation verification: a mechanical
// check after generation, not just a prompt instruction trusted on faith.
import type { BudgetAnalysis } from "./budget-analysis";

export interface BudgetVerificationIssue {
  type: "unverified_objective_number";
  detail: string;
}

const OBJECTIVE_FINDINGS_SECTION_RE = /##?\s*Objective Findings\s*\n([\s\S]*?)(?=\n##?\s*\S|\n\n##|$)/i;

// Requires an explicit $ prefix, comma-grouping, or % suffix -- a bare,
// unmarked digit sequence (a fiscal year like "2027", a page number, a
// plain count) is deliberately never treated as a financial figure worth
// checking, since prose is full of those and this check would otherwise
// flag "FY2027" as an unverified "$202" the moment a regex naively grabbed
// its first three digits.
const SIGNIFICANT_NUMBER_RE = /\$-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?%/g;

function normalizeNumber(raw: string): string[] {
  const isPercent = raw.endsWith("%");
  const digits = raw.replace(/[$,%]/g, "");
  const value = Number(digits);
  if (!Number.isFinite(value)) return [];
  // Multiple normalized forms so "4200000", "4,200,000.00", and "4200000.0"
  // all match the same underlying computed value regardless of how the
  // model formatted it.
  return [String(Math.round(value)), value.toFixed(2), isPercent ? `${Math.round(value)}%` : String(value)];
}

function collectKnownNumbers(analysis: BudgetAnalysis): Set<string> {
  const known = new Set<string>();
  const add = (value: number) => {
    for (const form of normalizeNumber(String(value))) known.add(form);
    for (const form of normalizeNumber(`${Math.abs(value)}%`)) known.add(form); // percent-change values are often stated as |delta|% with sign described in words
  };

  for (const total of analysis.categoryTotals) add(total.amount);
  for (const total of analysis.totalsByYear) add(total.total);
  for (const change of analysis.yearOverYearChanges) {
    add(change.fromAmount);
    add(change.toAmount);
    add(change.dollarChange);
    add(change.percentChange);
  }
  for (const stat of analysis.spendingPerResident) {
    add(stat.totalSpending);
    add(stat.population);
    add(stat.perResident);
  }
  return known;
}

// Only 3+ digit numbers found specifically within an "Objective Findings"
// section are checked -- everything elsewhere in the response (Policy
// Analysis, general prose) is out of scope for this specific mechanical
// check, since only Objective Findings claims to be pure, verifiable
// computation.
export function verifyBudgetObjectiveFindings(responseText: string, analysis: BudgetAnalysis): BudgetVerificationIssue[] {
  const sectionMatch = OBJECTIVE_FINDINGS_SECTION_RE.exec(responseText);
  if (!sectionMatch) return [];
  const section = sectionMatch[1];

  const known = collectKnownNumbers(analysis);
  const issues: BudgetVerificationIssue[] = [];
  const seen = new Set<string>();

  for (const match of section.matchAll(SIGNIFICANT_NUMBER_RE)) {
    const raw = match[0];
    const digitCount = raw.replace(/[^0-9]/g, "").length;
    if (digitCount < 3) continue; // e.g. "40%" alone isn't significant enough to require an exact computed match

    const forms = normalizeNumber(raw);
    if (forms.length === 0) continue;
    if (forms.some((form) => known.has(form))) continue;

    if (seen.has(raw)) continue;
    seen.add(raw);
    issues.push({
      type: "unverified_objective_number",
      detail: `"${raw}" appears in Objective Findings but does not match any number actually computed from the document's extracted financial data.`,
    });
  }

  return issues;
}

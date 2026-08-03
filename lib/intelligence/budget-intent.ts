// Deterministic (no LLM call) classifier, matching this project's other
// intent regexes (political-intent.ts, web-search-intent.ts). Detects a
// question shaped as a request for computed budget statistics -- these
// trigger Document Intelligence Phase 4's structured extraction +
// programmatic computation path instead of an ordinary document Q&A
// answer, so the model narrates pre-computed numbers rather than doing the
// arithmetic itself.
const BUDGET_ANALYSIS_RE =
  /\bpercentage (increase|decrease|change)\b|\byear[- ]over[- ]year\b|\bcompared? (to|with) last year\b|\bspending per (resident|capita|person)\b|\bper capita\b|\blargest (budget )?categor(y|ies)\b|\bbiggest (change|increase|decrease)\b|\bbudget (increase|decrease|change|trend)\b|\byoy\b|\bunusual transfers?\b|\bunexplained gaps?\b|\bremaining balances?\b|\btotal spending\b|\bhow much (did|does|was)\b.*\b(spend|budget)\b/i;

export function wantsBudgetAnalysis(text: string): boolean {
  return BUDGET_ANALYSIS_RE.test(text);
}

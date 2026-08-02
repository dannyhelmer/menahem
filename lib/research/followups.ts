import type { PoliticalIntent } from "@/lib/intelligence/political-intent";

// Deterministic (no LLM call) -- ported in spirit from the Python app's
// tools/political_research.build_followup_suggestions.
export function buildFollowupSuggestions(intents: Set<PoliticalIntent>): string[] {
  if (intents.has("comparison")) {
    return ["Look at a third option", "See full profile for each", "Which has more support?"];
  }
  if (intents.has("federal_legislation") || intents.has("state_legislation")) {
    return ["Who sponsored this bill?", "What's its current status?", "Related legislation"];
  }
  if (intents.has("campaign_finance")) {
    return ["Who are the top donors?", "Compare with another candidate", "Independent expenditures"];
  }
  if (intents.has("elections")) {
    return ["What's the filing deadline?", "Recent polling", "Who else is running?"];
  }
  if (intents.has("executive_branch")) {
    return ["The administration", "Executive orders", "Political party", "Recent news"];
  }
  if (intents.has("congress") || intents.has("governor")) {
    return ["Voting record", "Campaign finance", "Recent news"];
  }
  return ["Recent developments", "Opposing viewpoints", "Primary sources"];
}

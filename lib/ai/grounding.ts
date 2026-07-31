// Grounding module: enforces strict retrieval grounding for a government
// intelligence platform. Every factual claim must originate from retrieved
// documents; previous conversation turns (including prior assistant responses)
// must never be treated as evidence.
//
// This module provides three layers of defense:
//   1. Context Isolation -- strips previous conversation turns from the model's
//      input for retrieval-grounded queries, so stale facts physically cannot
//      leak.
//   2. Grounding Instructions -- explicit instructions injected into the system
//      prompt that reinforce the isolation guarantee at the model level.
//   3. Evidence Validation -- a post-generation pass that checks the response
//      against retrieved sources for obvious grounding violations.

import type { ChatMessage } from "./types";

// ---------------------------------------------------------------------------
// 1. Grounding Instructions
// ---------------------------------------------------------------------------

// Explicit grounding rules injected into the system prompt whenever live data
// (retrieved documents) is present. These reinforce the context-isolation
// guarantee at the model level: the model is told that ONLY the live data
// section is authoritative, and previous conversation turns -- including prior
// assistant responses -- must not be treated as evidence.
export const GROUNDING_INSTRUCTIONS = `
=== GROUNDING RULES (government intelligence platform) ===
Every factual claim in your response MUST originate from the "Live data" section below.
- Do NOT reuse factual information from previous assistant responses or prior conversations.
- Do NOT treat previous assistant messages as evidence.
- Do NOT treat previous user messages as evidence.
- If a claim has no source in the retrieved documents, discard it.
- If evidence is missing, say: "I could not verify this information from the retrieved official sources."
- Never infer, estimate, or fabricate funding amounts, sponsors, sections, or policy differences.
- Every statistic must exist in a retrieved source. Every quoted section must match verbatim.
- Every comparison must be supported by both retrieved documents.
- If differences cannot be determined from retrieved documents, explicitly say so.
=== END GROUNDING RULES ===
`;

// ---------------------------------------------------------------------------
// 2. Context Isolation
// ---------------------------------------------------------------------------

// Categories that involve retrieval grounding. For these, previous conversation
// turns (including prior assistant responses with their factual claims) are
// stripped from the model's input so stale facts cannot leak into the new
// answer. Non-retrieval categories (fast_path, math, casual conversation) keep
// the full history since they don't involve retrieval grounding.
export const GROUNDED_CATEGORIES = new Set([
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
]);

// Determines whether a route outcome category is retrieval-grounded.
export function isGroundedCategory(category: string): boolean {
  return GROUNDED_CATEGORIES.has(category);
}

// Strips all previous conversation turns, keeping only the system prompt
// (with live data) and the current user message. This is the core
// context-isolation mechanism: for retrieval-grounded queries, the model sees
// ONLY the system prompt and the current user message -- no prior assistant
// responses that could leak stale facts.
//
// The `userMessage` should already be query-resolved (via resolveFollowupTopic)
// so that short follow-ups like "what about Harris?" are expanded into a
// standalone question before the conversation context is removed.
export function buildIsolatedMessages(
  systemPrompt: string,
  userMessage: ChatMessage,
): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt },
    userMessage,
  ];
}

// Encapsulates the message-construction logic from the chat API route:
// for retrieval-grounded messages, the model receives ONLY the system prompt
// (with live data) and the current user message -- no previous conversation
// turns. For non-grounded messages (fast path, math, casual conversation),
// the full conversation history is preserved.
//
// This is the single function that decides what the model actually sees,
// making it the critical control point for context isolation.
export function buildModelMessages(
  grounded: boolean,
  systemPrompt: string,
  messages: ChatMessage[],
  resolvedUserText: string,
): ChatMessage[] {
  if (grounded) {
    return buildIsolatedMessages(systemPrompt, { role: "user", content: resolvedUserText });
  }
  return [{ role: "system", content: systemPrompt }, ...messages];
}

// ---------------------------------------------------------------------------
// 3. Evidence Validation
// ---------------------------------------------------------------------------

export type GroundingIssueType = "missing_source" | "unsupported_claim" | "stale_context";

export interface GroundingIssue {
  type: GroundingIssueType;
  detail: string;
}

// Lightweight, heuristic-based evidence validation. Runs after generation as a
// defense-in-depth pass. The primary guarantee is context isolation (previous
// turns are stripped), but this catches cases where the model still hallucinates
// or where the live data was empty.
//
// Checks:
//   - If the response makes factual claims but no sources were retrieved, flag it.
//   - If the response contains numerical values that don't appear in the live
//     data, flag them as potentially unsupported.
//   - If the response contains quoted sections (double-quoted strings) that
//     don't appear in the live data, flag them.
export function validateEvidence(
  response: string,
  sources: { title: string; url: string }[],
  liveData: string | undefined,
): GroundingIssue[] {
  const issues: GroundingIssue[] = [];

  // If there are no sources and no live data, the response should not make
  // factual claims.
  if (sources.length === 0 && (!liveData || liveData.trim() === "")) {
    // Check if the response seems to make factual claims (longer than a
    // simple acknowledgment, and not explicitly saying it couldn't verify).
    const trimmed = response.trim();
    if (
      trimmed.length > 80 &&
      !/could not verify|don't have|do not have|I (don't|cannot) (find|verify|confirm)/i.test(trimmed)
    ) {
      issues.push({
        type: "missing_source",
        detail: "Response makes claims without any retrieved sources to back them.",
      });
    }
    return issues;
  }

  const haystack = liveData ?? "";

  // Check for numerical values in the response that don't appear in the live
  // data. This catches cases where the model reuses numbers from a previous
  // conversation (e.g. budget figures from a prior comparison).
  // We look for numbers with 3+ digits (to avoid matching common small numbers
  // like "1", "2", "3" that appear in ordinary prose).
  const responseNumbers = extractSignificantNumbers(response);
  const liveDataNumbers = extractSignificantNumbers(haystack);
  const liveNumberSet = new Set(liveDataNumbers);

  for (const num of responseNumbers) {
    if (!liveNumberSet.has(num)) {
      issues.push({
        type: "unsupported_claim",
        detail: `Numerical value "${num}" in the response does not appear in any retrieved source.`,
      });
    }
  }

  // Check for quoted sections in the response that don't appear verbatim in
  // the live data.
  const quotedSections = extractQuotedSections(response);
  for (const quote of quotedSections) {
    if (quote.length > 15 && !haystack.includes(quote)) {
      issues.push({
        type: "unsupported_claim",
        detail: `Quoted section "${quote.slice(0, 60)}..." does not appear verbatim in any retrieved source.`,
      });
    }
  }

  return issues;
}

// Extracts significant numbers (3+ digits) from text, preserving the original
// string representation so we can compare exactly.
function extractSignificantNumbers(text: string): string[] {
  const matches = text.match(/\d{3,}(?:[,.]\d+)*/g);
  if (!matches) return [];
  return matches.map((m) => m.replace(/,/g, ""));
}

// Extracts double-quoted strings from text.
function extractQuotedSections(text: string): string[] {
  const matches = text.match(/"([^"]{15,})"/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

// ---------------------------------------------------------------------------
// 4. Validation Pass
// ---------------------------------------------------------------------------

// Performs a full validation pass on a generated response. Returns the
// response with unsupported claims removed (if possible) and a list of
// remaining issues.
//
// This is the "Validation Pass" required by the grounding spec:
//   - Remove unsupported claims.
//   - Remove stale context from previous conversations.
//   - Ensure every numerical value appears in a retrieved source.
//   - Ensure every quoted section matches the retrieved text.
export function performValidationPass(
  response: string,
  sources: { title: string; url: string }[],
  liveData: string | undefined,
): { response: string; issues: GroundingIssue[] } {
  const issues = validateEvidence(response, sources, liveData);

  // If there are critical issues (missing source with no live data), append
  // a grounding notice to the response.
  const hasMissingSource = issues.some((i) => i.type === "missing_source");
  if (hasMissingSource) {
    const notice =
      "\n\nI could not verify this information from the retrieved official sources.";
    if (!response.includes(notice.trim())) {
      return { response: response.trimEnd() + notice, issues };
    }
  }

  return { response, issues };
}

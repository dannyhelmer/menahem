import { getProvider } from "@/lib/ai/get-provider";
import type { Jurisdiction } from "@/lib/intelligence/jurisdiction";
import { resolveJurisdictionAndState } from "@/lib/intelligence/jurisdiction";
import type { PoliticalIntent } from "@/lib/intelligence/political-intent";
import { buildConfidenceReason, buildResearchPacket, type ResearchPacket, type TieredSource } from "./packet";
import { sortByAuthority } from "./source-tier";

const MAX_SUBQUESTIONS = 6;
const DEEP_RESEARCH_SEARCH_COUNT = 15;
const TIER_SCORE: Record<TieredSource["tier"], number> = { government: 4, news: 3, reference: 2, general: 1 };
const CONFIDENCE_RANK: Record<ResearchPacket["confidence"], number> = { high: 3, medium: 2, low: 1 };

// One quick LLM call, same pattern as lib/memory/title.ts -- not a heavy
// agent loop. Falls back to the original question (as its own sole
// "sub-question") on any failure, empty result, or a degenerate response.
export async function decomposeQuestion(question: string, userId?: string): Promise<string[]> {
  const provider = await getProvider(userId);
  if (!(await provider.isConfigured())) return [question];

  const prompt =
    "Break this question into 3-6 focused sub-questions that, together, would fully answer it. " +
    "Think about what dimensions a thorough researcher would cover: the core factual question, " +
    "historical context, current status, key stakeholders or parties involved, relevant data or " +
    "statistics, comparisons or alternatives, and potential future developments. If the original question " +
    "named a specific state, jurisdiction, or bill number, restate it explicitly in any sub-question where " +
    "it's relevant -- each sub-question is researched independently and won't see the others or the original " +
    "question's own wording. Reply with ONLY the sub-questions, one per line, no numbering, no explanation.\n\n" +
    `Question: ${question}`;

  let result = "";
  try {
    await provider.streamChat([{ role: "user", content: prompt }], (piece) => {
      result += piece;
    });
  } catch {
    return [question];
  }

  const lines = result
    .split("\n")
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);

  if (lines.length === 0 || lines.length > 8) return [question];
  return lines.slice(0, MAX_SUBQUESTIONS);
}

export async function runDeepResearch(
  question: string,
  intents: Set<PoliticalIntent>,
  jurisdiction: Jurisdiction,
  state: string | null,
  onStage?: (label: string) => void,
  userId?: string,
): Promise<ResearchPacket> {
  onStage?.("Planning research");
  const subquestions = await decomposeQuestion(question, userId);

  onStage?.("Searching sources");
  // Fix 2 (per-subtask jurisdiction), deep-research variant: re-resolve
  // per sub-question, same fallback-to-outer semantics as comparison (sub-
  // questions are dimensional angles on ONE topic by construction, not
  // independent topics naming different states, so a sub-question with no
  // state of its own should still use the outer, whole-question state
  // rather than falling back to null).
  const packets = await Promise.all(
    subquestions.map((sub) => {
      const resolved = resolveJurisdictionAndState(sub, intents);
      return buildResearchPacket(
        sub,
        intents,
        resolved.state ? resolved.jurisdiction : jurisdiction,
        resolved.state ?? state,
        { maxSearchResults: DEEP_RESEARCH_SEARCH_COUNT },
      );
    }),
  );

  onStage?.("Comparing findings");

  const sourceByUrl = new Map<string, TieredSource>();
  for (const packet of packets) {
    for (const source of packet.sources) {
      const existing = sourceByUrl.get(source.url);
      if (!existing || TIER_SCORE[source.tier] > TIER_SCORE[existing.tier]) {
        sourceByUrl.set(source.url, source);
      }
    }
  }
  const sources = sortByAuthority(Array.from(sourceByUrl.values()));

  const confidence = packets.reduce<ResearchPacket["confidence"]>(
    (best, packet) => (CONFIDENCE_RANK[packet.confidence] > CONFIDENCE_RANK[best] ? packet.confidence : best),
    "low",
  );

  const sections = packets.map((packet, i) => `Sub-question: ${subquestions[i]}\n\n${packet.liveData}`);

  const liveData = [
    `Deep Research: this question was broken into ${subquestions.length} sub-question(s), each researched independently with ${DEEP_RESEARCH_SEARCH_COUNT} sources searched per sub-question.`,
    "This is a DEEP RESEARCH report -- produce roughly 2-3x more detailed output than a normal answer. " +
      "Compare claims across sub-questions -- where they agree, say so; where they conflict, point out the " +
      "conflict explicitly rather than silently picking one. " +
      "Structure your answer with these sections: " +
      "(1) Executive Summary -- a concise overview of the key findings; " +
      "(2) Detailed Findings -- the full analysis organized by theme or sub-question, with each claim sourced; " +
      "(3) Timeline -- if the topic has a chronological dimension, present key events with dates in a timeline format; " +
      "(4) Comparisons -- use tables when comparing multiple items (candidates, bills, policies, jurisdictions) " +
      "so the reader can see differences at a glance; " +
      "(5) Multiple Viewpoints -- where genuine disagreement exists, present each viewpoint with its supporting " +
      "evidence and name who holds it; " +
      "(6) Confidence Assessment -- state your confidence level (High/Medium/Low) and explain what evidence " +
      "supports it and what gaps remain; " +
      "(7) Sources -- list all sources cited. " +
      "Use markdown tables where they genuinely improve readability. Use headings (##) for each section. " +
      "Be thorough and specific -- this is a research report, not a chat reply.",
    ...sections,
  ].join("\n\n---\n\n");

  const confidenceReason =
    `Based on ${subquestions.length} independently researched sub-question(s). ` +
    buildConfidenceReason(confidence, sources, confidence === "high");

  // Deep Research aggregates multiple independently-researched sub-questions
  // and already reports the BEST confidence across them (see CONFIDENCE_RANK
  // reduce above) -- retrievalFailed mirrors that same "best of" philosophy:
  // only a genuine failure across EVERY sub-question counts as an overall
  // retrieval failure, not just one weak sub-question dragging down an
  // otherwise well-evidenced report.
  const retrievalFailed = packets.every((packet) => packet.retrievalFailed);
  const retrievalFailureReason = retrievalFailed
    ? "None of the independently researched sub-questions found sufficient official or corroborated evidence, " +
      "even after each was automatically retried with a broadened secondary-source search."
    : undefined;

  return {
    intents: Array.from(intents),
    jurisdiction,
    state,
    sources,
    liveData,
    confidence,
    confidenceReason,
    retrievalFailed,
    retrievalFailureReason,
  };
}

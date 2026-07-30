import { getProvider } from "@/lib/ai/get-provider";
import type { Jurisdiction } from "@/lib/intelligence/jurisdiction";
import type { PoliticalIntent } from "@/lib/intelligence/political-intent";
import { buildConfidenceReason, buildResearchPacket, type ResearchPacket, type TieredSource } from "./packet";
import { sortByAuthority } from "./source-tier";

const MAX_SUBQUESTIONS = 4;
const TIER_SCORE: Record<TieredSource["tier"], number> = { government: 4, news: 3, reference: 2, general: 1 };
const CONFIDENCE_RANK: Record<ResearchPacket["confidence"], number> = { high: 3, medium: 2, low: 1 };

// One quick LLM call, same pattern as lib/memory/title.ts -- not a heavy
// agent loop. Falls back to the original question (as its own sole
// "sub-question") on any failure, empty result, or a degenerate response.
export async function decomposeQuestion(question: string, userId?: string): Promise<string[]> {
  const provider = await getProvider(userId);
  if (!(await provider.isConfigured())) return [question];

  const prompt =
    "Break this question into 2-4 focused sub-questions that, together, would fully answer it. " +
    "Reply with ONLY the sub-questions, one per line, no numbering, no explanation.\n\n" +
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

  if (lines.length === 0 || lines.length > 6) return [question];
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
  const packets = await Promise.all(
    subquestions.map((sub) => buildResearchPacket(sub, intents, jurisdiction, state)),
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
    `Deep Research: this question was broken into ${subquestions.length} sub-question(s), each researched independently.`,
    "Compare claims across sub-questions -- where they agree, say so; where they conflict, point out the " +
      "conflict explicitly rather than silently picking one. Structure your answer as: Summary, Detailed " +
      "Findings, Sources.",
    ...sections,
  ].join("\n\n---\n\n");

  const confidenceReason =
    `Based on ${subquestions.length} independently researched sub-question(s). ` +
    buildConfidenceReason(confidence, sources, confidence === "high");

  return { intents: Array.from(intents), jurisdiction, state, sources, liveData, confidence, confidenceReason };
}

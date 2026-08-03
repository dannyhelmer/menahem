import type { Jurisdiction } from "@/lib/intelligence/jurisdiction";
import type { ComparisonTargets } from "@/lib/intelligence/comparison-targets";
import type { PoliticalIntent } from "@/lib/intelligence/political-intent";
import { buildResearchPacket, type TieredSource } from "./packet";
import { dedupeByUrl, sortByAuthority } from "./source-tier";

export interface ComparisonPacket {
  liveData: string;
  sources: TieredSource[];
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
}

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

// Reuses buildResearchPacket() untouched, once per subject -- each side gets
// the same retrieval, source-tiering, and low-confidence honesty guardrails
// as a normal single-entity lookup. This is a merge layer only; it never
// teaches providers about "two entities."
export async function buildComparisonPacket(
  targets: ComparisonTargets,
  intents: Set<PoliticalIntent>,
  jurisdiction: Jurisdiction,
  state: string | null,
): Promise<ComparisonPacket> {
  const [packetA, packetB] = await Promise.all([
    buildResearchPacket(targets.a, intents, jurisdiction, state),
    buildResearchPacket(targets.b, intents, jurisdiction, state),
  ]);

  const weakerPacket =
    CONFIDENCE_RANK[packetA.confidence] <= CONFIDENCE_RANK[packetB.confidence] ? packetA : packetB;
  const confidence = weakerPacket.confidence;
  const confidenceReason =
    `Overall confidence reflects the weaker-evidenced side of this comparison. ${weakerPacket.confidenceReason}`;

  const liveData = [
    `Side-by-side comparison packet: "${targets.a}" vs "${targets.b}". Treat these as two separate subjects -- ` +
      "never blend facts between them, and only cite a subject's own sources for claims about that subject.",
    `--- Subject A: ${targets.a} ---`,
    packetA.liveData,
    `--- Subject B: ${targets.b} ---`,
    packetB.liveData,
  ].join("\n\n");

  return {
    liveData,
    sources: sortByAuthority(dedupeByUrl([...packetA.sources, ...packetB.sources])),
    confidence,
    confidenceReason,
  };
}

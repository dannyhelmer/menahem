import type { Jurisdiction } from "@/lib/intelligence/jurisdiction";
import type { PoliticalIntent } from "@/lib/intelligence/political-intent";
import { GOV_DATA_PROVIDERS } from "@/lib/gov-data/registry";
import type { GovDataProvider } from "@/lib/gov-data/types";
import { getConnectedEntities } from "@/lib/graph/store";
import { getTimeline } from "@/lib/timeline/store";
import { runSearchForMessage } from "@/lib/search/orchestrate";
import { detectRecencyNeed } from "@/lib/intelligence/web-search-intent";
import { sortByAuthority, sourceTier, type SourceTier } from "./source-tier";

const LEGISLATIVE_SUMMARY_INTENTS: PoliticalIntent[] = [
  "federal_legislation",
  "state_legislation",
  "budget",
  "regulations",
];

// Neutral, structured legislative/policy summary format -- only applies to
// the intents where it actually makes sense (a bill, budget, or regulation
// with real stakeholders on multiple sides), not every political question.
// Folded into buildResearchPacket's instructions so it automatically
// reaches Deep Research and Comparison too, since both build on top of
// this same function per sub-question/side.
const LEGISLATIVE_SUMMARY_INSTRUCTIONS =
  "This question concerns legislation, a budget, or a regulation -- structure the answer neutrally: (1) a " +
  "concise factual overview of what it actually does, (2) a section headed exactly \"Supporters Argue\" " +
  "covering the strongest arguments for it (stated goals and expected benefits, attributed to who's actually " +
  "making them), (3) a section headed exactly \"Critics Argue\" covering the strongest arguments against it " +
  "(concerns and projected consequences, attributed the same way), (4) a section headed exactly \"Why It " +
  "Matters\" -- 2-4 concise, factual sentences on why this is significant, who it affects, and why it's worth a " +
  "reader's attention, analytical rather than opinionated -- then (5) the Verification section described below. " +
  "This shape (Overview, Supporters Argue, Critics Argue, Why It Matters, Verification) applies specifically to " +
  "substantive legislation/budget/regulation questions -- always include Why It Matters here, don't drop it even " +
  "though this is a more specific template than the general response shape described elsewhere. Summarize each " +
  "side fairly from real, sourced material -- never invent a position nobody has actually taken, and never " +
  "present either side's argument as objective fact rather than an attributed position. Do not add an \"Areas " +
  "of Agreement\" or consensus section -- that framing implies a political consensus exists, which isn't " +
  "something to assert. " +
  "Keep fact, projection, and opinion visibly distinct -- never blend them into one sentence. Any estimate " +
  "(spending, coverage, economic effects) must name who produced it (e.g. the Congressional Budget Office, the " +
  "White House, an advocacy group, a think tank) and note that it depends on stated assumptions, not just " +
  "report a bare number. Prefer primary sources (the bill text itself, official government analyses, " +
  "nonpartisan agencies) over advocacy-organization framing; if advocacy sources are used, include " +
  "organizations representing more than one perspective, and say so explicitly if the available sources lean " +
  "one direction. Avoid emotionally loaded language (\"devastating,\" \"radical,\" \"massive,\" \"disastrous\") " +
  "unless directly quoting a named source, clearly marked as a quote. For individual checkable claims within " +
  "the answer (a specific figure, date, projection, or attributed position) -- not ordinary connecting prose -- " +
  "tag the claim's evidentiary status inline as **Fact:**, **Projection:**, or **Opinion:**, each followed by a " +
  "confidence note (High/Medium/Low for facts and projections, \"Opinion (attributed claim)\" for opinions). " +
  "For example: \"**Fact:** The bill raises the Child Tax Credit from $2,000 to $2,200. (Confidence: High.)\" / " +
  "\"**Projection:** The Congressional Budget Office estimates approximately 17 million people could lose " +
  "coverage under this bill. (Confidence: Medium -- a modeled estimate, not a certainty.)\" / \"**Opinion:** " +
  "Critics argue the bill will substantially harm rural hospitals. (Confidence: Opinion -- an attributed " +
  "position, not a verified fact.)\" In addition to Fact/Projection/Opinion, tag anything you're inferring or " +
  "unsure of as **Speculation:**, with confidence noted as \"Speculation (unverified)\" -- never present a " +
  "guess as if it were a fact.\n\n" +
  "When a bill has a commonly recognized popular name distinct from its formal legal title (e.g. an act whose " +
  "official title is a dry procedural description but which is widely known by a shorter public name), always " +
  "show BOTH as their own separate labeled lines near the top of the answer, exactly like this -- not woven " +
  "into a sentence: \"**Official Title:** An act to provide for reconciliation pursuant to title II of H. Con. " +
  "Res. 14\" on one line, then \"**Common Name:** One Big Beautiful Bill Act\" on the next. Only do this when a " +
  "real, distinct common name exists; don't invent one or force the distinction when a bill is only ever " +
  "referred to by its official title.\n\n" +
  "Bill numbers restart every new Congress -- the same number (e.g. H.R. 1) can refer to a completely " +
  "different bill in a different Congress. Before answering, explicitly determine and state: (1) which " +
  "Congress the bill belongs to (e.g. 116th, 117th, 118th, 119th), (2) its official title, (3) whether it " +
  "became law, and (4) that every provision you describe actually belongs to that specific bill in that " +
  "specific Congress -- never blend in provisions, outcomes, or figures from a different bill that happens to " +
  "share the same number. If the retrieved data or your own knowledge suggests two different bills share this " +
  "number, stop and say plainly: \"Possible bill-number collision detected. H.R. numbers restart every " +
  "Congress. These appear to be different bills.\" and address them separately rather than merging them.\n\n" +
  "End every legislative/policy answer with a section headed exactly \"Verification\" listing, as checkmarked " +
  "lines, ONLY the specific items you can actually confirm from the data you were given -- bill number, " +
  "Congress/session, official title, sponsor, current legislative status, policy area, and official government " +
  "source match are the possible items, but this is not a fixed template to fill in regardless of what you " +
  "actually have. Omit any line you cannot genuinely verify -- never display a checkmark for something you " +
  "didn't actually confirm, and never claim a verification step happened if it didn't. A shorter, honest list " +
  "is correct; a complete-looking but partly fabricated one is not. Format each confirmed line as, for example, " +
  "\"✓ Bill number verified\" / \"✓ Congress.gov match\" / \"✓ Sponsor verified\" / \"✓ Legislative status " +
  "verified.\" If you cannot verify any of these items at all, omit the Verification section entirely rather " +
  "than showing an empty or fabricated one.";

// Best-effort: a bill's real, sourced action history gives the model
// ordered ground truth instead of asking it to infer sequence from a
// single latestAction string. Silently omitted if no timeline exists yet
// (e.g. gov keys unconfigured) -- never fabricates a history that isn't
// actually on file.
async function buildTimelineNote(entityId: string | undefined): Promise<string | null> {
  if (!entityId) return null;
  try {
    const timeline = await getTimeline(entityId);
    if (!timeline || timeline.events.length === 0) return null;
    const lines = timeline.events.map((e) => `${e.date}: ${e.label} -- ${e.description}`);
    return `Real, sourced action history for this bill (chronological, earliest first):\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

// Best-effort: checks whether the knowledge graph already has other bills
// connected to this representative (from earlier lookups) and, if so,
// surfaces that as a short note -- the first real demonstration of the
// graph being *read*, not just written to. Never throws; a graph miss or
// read failure just means no note gets added.
async function buildRelatedEntitiesNote(
  representativeId: string | undefined,
  currentEntityId: string | undefined,
): Promise<string | null> {
  if (!representativeId) return null;
  try {
    const connected = await getConnectedEntities(representativeId, { relationship: "sponsored" });
    const otherBills = connected.filter((c) => c.entity.id !== currentEntityId);
    if (otherBills.length === 0) return null;
    const titles = otherBills.map((c) => `- ${c.entity.label}`).join("\n");
    return (
      `Menahem has previously looked up ${otherBills.length} other bill(s) sponsored by this representative:\n${titles}`
    );
  } catch {
    return null;
  }
}

export interface TieredSource {
  title: string;
  url: string;
  tier: SourceTier;
}

export interface ResearchPacket {
  intents: PoliticalIntent[];
  jurisdiction: Jurisdiction;
  state: string | null;
  sources: TieredSource[];
  liveData: string;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
}

// Deterministic, mechanical explanation of a confidence rating -- source
// counts and composition only, never an editorial claim about the topic
// itself (that would require judgment this function doesn't have grounds
// to make). Shared by the plain packet, Deep Research, and Comparison so
// "why is this Medium?" always has a real, honest answer behind it.
export function buildConfidenceReason(
  confidence: ResearchPacket["confidence"],
  sources: TieredSource[],
  directGovHit: boolean,
): string {
  const counts: Record<SourceTier, number> = { government: 0, news: 0, reference: 0, general: 0 };
  for (const s of sources) counts[s.tier]++;

  // A checkmark-style breakdown reads as an actual evidence inventory
  // rather than a vague "based on some sources" sentence -- lets a reader
  // see at a glance whether a rating is backed by official records, wire
  // reporting, or just a couple of general pages.
  const lines: string[] = [];
  if (counts.government > 0) lines.push(`✓ ${counts.government} official government source${counts.government === 1 ? "" : "s"}`);
  if (counts.news > 0) lines.push(`✓ ${counts.news} news organization${counts.news === 1 ? "" : "s"}`);
  if (counts.reference > 0) lines.push(`✓ ${counts.reference} academic/reference source${counts.reference === 1 ? "" : "s"}`);
  if (counts.general > 0) lines.push(`✓ ${counts.general} other source${counts.general === 1 ? "" : "s"}`);

  const basis = lines.length > 0 ? `Based on:\n${lines.join("\n")}` : "No sources were retrieved for this question.";

  if (confidence === "low") return `${basis}\nNot enough was found to verify specific details with confidence.`;
  if (confidence === "medium") {
    return `${basis}\nAt least one source was found, but not enough official corroboration to rate this higher.`;
  }
  return directGovHit
    ? `${basis}\nRetrieved directly from an authoritative government data source.`
    : `${basis}\nCorroborated by an official government source alongside others.`;
}

function selectGovProviders(intents: Set<PoliticalIntent>, jurisdiction: Jurisdiction): GovDataProvider[] {
  if (jurisdiction !== "federal") return [];
  const providers: GovDataProvider[] = [];
  const congress = GOV_DATA_PROVIDERS.find((p) => p.id === "congress");
  const fec = GOV_DATA_PROVIDERS.find((p) => p.id === "fec");

  if (congress && (intents.has("federal_legislation") || intents.has("congress") || intents.has("executive_branch"))) {
    providers.push(congress);
  }
  if (fec && intents.has("campaign_finance")) providers.push(fec);

  return providers;
}

export async function buildResearchPacket(
  question: string,
  intents: Set<PoliticalIntent>,
  jurisdiction: Jurisdiction,
  state: string | null,
  options?: { maxSearchResults?: number },
): Promise<ResearchPacket> {
  const maxSearchResults = options?.maxSearchResults ?? 10;
  const providers = selectGovProviders(intents, jurisdiction);
  const liveDataParts: string[] = [];
  const sources: TieredSource[] = [];
  let directGovHit = false;

  for (const provider of providers) {
    if (!(await provider.isConfigured())) continue;
    const result = await provider.retrieve(question);
    if (result.success && result.liveData) {
      liveDataParts.push(result.liveData);
      directGovHit = true;
      for (const s of result.sources ?? []) sources.push({ ...s, tier: sourceTier(s.url) });

      const relatedNote = await buildRelatedEntitiesNote(result.graph?.representativeId, result.graph?.entityId);
      if (relatedNote) liveDataParts.push(relatedNote);

      const timelineNote = await buildTimelineNote(result.graph?.entityId);
      if (timelineNote) liveDataParts.push(timelineNote);
    } else if (result.note) {
      liveDataParts.push(result.note);
    }
  }

  const searchResult = await runSearchForMessage(question, maxSearchResults, { preferRecent: detectRecencyNeed(question) });
  if (searchResult.success && searchResult.liveData) {
    liveDataParts.push(searchResult.liveData);
    for (const s of searchResult.sources ?? []) sources.push({ ...s, tier: sourceTier(s.url) });
  } else if (searchResult.note) {
    liveDataParts.push(searchResult.note);
  }

  const governmentSourceCount = sources.filter((s) => s.tier === "government").length;
  let confidence: ResearchPacket["confidence"];
  if (directGovHit || (governmentSourceCount >= 1 && sources.length >= 2)) confidence = "high";
  else if (sources.length >= 1) confidence = "medium";
  else confidence = "low";

  const instructions = [
    "Cite every source you use by its URL. Never invent a source, figure, or detail not present below.",
    "When multiple sources corroborate the same fact, prefer citing the most authoritative one available, in " +
      "this order: official .gov sites (Congress.gov, WhiteHouse.gov, House.gov/Senate.gov, CBO.gov, CRS " +
      "Reports), the Federal Register, Supreme Court opinions, official state government sites, then Reuters/AP, " +
      "then other major news organizations, then other news sources, then Wikipedia only as background/" +
      "supporting context -- never let a lower-authority news site outrank an official source that says the " +
      "same thing.",
  ];
  if (LEGISLATIVE_SUMMARY_INTENTS.some((intent) => intents.has(intent))) {
    instructions.push(LEGISLATIVE_SUMMARY_INSTRUCTIONS);
  }
  if (confidence === "low") {
    instructions.push(
      "No official government source or web search result was retrieved for this question -- nothing below " +
        "verifies specific facts (bill numbers, sponsors, vote counts, candidate names, dates, figures). If you " +
        "still answer from your own general knowledge, you MUST say explicitly that this is unverified/from " +
        "training data and may be outdated or wrong -- do not state specific details as if they were just " +
        "confirmed. If you aren't confident, say plainly that you don't have verified information rather than " +
        "describing a plausible-sounding bill, race, or figure as fact.",
    );
  }

  const liveData = [
    `Government/political research packet for: ${question}`,
    `Jurisdiction: ${jurisdiction}${state ? ` (${state})` : ""}.`,
    ...instructions,
    ...liveDataParts,
  ].join("\n\n---\n\n");

  const sortedSources = sortByAuthority(sources);
  return {
    intents: Array.from(intents),
    jurisdiction,
    state,
    sources: sortedSources,
    liveData,
    confidence,
    confidenceReason: buildConfidenceReason(confidence, sortedSources, directGovHit),
  };
}

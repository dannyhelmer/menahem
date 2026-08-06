// Research planning: decomposes a broad, multi-topic question into
// independent research tasks BEFORE retrieval, instead of running one
// search against the whole question and blurring several unrelated topics
// together. Each task is retrieved independently (via buildResearchPacket,
// which already evaluates evidence and auto-retries with a broadened query
// once per task -- see runSearchWithRetry in lib/search/orchestrate.ts), so
// a targeted retry already happens per-subsection with no extra plumbing
// needed here. Failures are isolated per task (Promise.allSettled) so one
// weak or failed subsection never prevents the rest of the report from
// being generated -- graceful degradation, not total failure.

import type { Jurisdiction } from "@/lib/intelligence/jurisdiction";
import { resolveJurisdictionAndState } from "@/lib/intelligence/jurisdiction";
import type { PoliticalIntent } from "@/lib/intelligence/political-intent";
import { getProvider } from "@/lib/ai/get-provider";
import { buildConfidenceReason, buildResearchPacket, type ResearchPacket, type TieredSource } from "./packet";
import { dedupeByUrl, sortByAuthority } from "./source-tier";

export const MAX_RESEARCH_TASKS = 6;
const PLANNED_SEARCH_COUNT = 8;

// The exact sentence required for a section with no usable evidence --
// kept as one constant so the liveData instructions and this comment always
// agree on the literal wording the model must reproduce verbatim.
export const INSUFFICIENT_SECTION_PHRASE = "Insufficient official sources were retrieved for this section.";

// A rough split on commas/"and"/"or"/semicolons -- if the question already
// reads as 3+ distinct topic-shaped segments (e.g. "Illinois housing laws,
// Illinois housing bills, federal housing programs, court decisions,
// housing grants, and policy analysis"), a single search against the whole
// sentence would blur together several genuinely independent topics.
// Deterministic (no LLM call), matching this project's classifier
// conventions -- only ever consulted from inside the already-political
// branch of routing, so false positives are contained to political
// questions specifically.
const SEGMENT_SPLIT_RE = /,|;|\band\b|\bor\b/i;
const QUESTION_STEM_RE = /^(what are|what is|tell me about|explain|give me|describe|summarize|research|find)\s+/i;

export function detectMultiPartResearchQuestion(text: string): boolean {
  const body = text.replace(QUESTION_STEM_RE, "").trim();
  const segments = body
    .split(SEGMENT_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 2);
  return segments.length >= 3;
}

// One quick LLM call, same fallback-safe pattern as deep-research.ts's
// decomposeQuestion -- but tailored to PRESERVE the user's own listed
// topics as separate tasks rather than inventing generic research
// "dimensions" (angles on a single topic), which is what Deep Research's
// decomposition does and isn't the right fit for an already-multi-topic
// question.
export async function planResearchTasks(question: string, userId?: string): Promise<string[]> {
  const provider = await getProvider(userId);
  if (!(await provider.isConfigured())) return [question];

  const prompt =
    "This question asks about several independent topics at once. Break it into separate, standalone research " +
    "tasks -- one per distinct topic the user actually named. Do not invent new angles or dimensions beyond " +
    "what's asked; preserve the user's own breakdown. Each task should be phrased as its own complete, " +
    "self-contained question a researcher could look up on its own. If the original question named a specific " +
    "state, jurisdiction, or bill number for a particular topic, restate that same state/jurisdiction/bill " +
    "number explicitly in that task's own text -- never rely on another task or the original question to " +
    "supply it, since each task is researched completely independently and won't see the others. For example, " +
    "a question comparing \"Illinois, Texas, and Florida\" on one topic must produce tasks that each explicitly " +
    "say their own state's name (\"...in Illinois\", \"...in Texas\", \"...in Florida\"), not three generic " +
    "tasks that only the original question's ordering would let you tell apart. Reply with ONLY the tasks, one " +
    "per line, no numbering, no explanation.\n\n" +
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
  return lines.slice(0, MAX_RESEARCH_TASKS);
}

function sectionConfidence(result: PromiseSettledResult<ResearchPacket>): ResearchPacket["confidence"] {
  return result.status === "fulfilled" ? result.value.confidence : "low";
}

// Overall confidence for a multi-section planned report is NOT "the
// weakest section wins" -- one thin subsection out of six shouldn't drag an
// otherwise well-evidenced report down to Low. Instead it reflects the
// PROPORTION of sections actually backed by retrieved sources, so a mostly
// well-sourced report with one gap still reads as mostly reliable rather
// than being reported as unreliable overall.
function computeOverallConfidence(sectionConfidences: ResearchPacket["confidence"][]): ResearchPacket["confidence"] {
  if (sectionConfidences.length === 0) return "low";
  const highRatio = sectionConfidences.filter((c) => c === "high").length / sectionConfidences.length;
  const supportedRatio = sectionConfidences.filter((c) => c !== "low").length / sectionConfidences.length;
  if (highRatio >= 0.6) return "high";
  if (supportedRatio >= 0.5) return "medium";
  return "low";
}

// A task paired with the exact key its citations must be scoped to, AND its
// jurisdiction/state -- both already known from the caller (see
// lib/research/research-plan.ts's planResearch), which has already
// identified the specific real-world entities this question needs and
// where each one is FROM. buildPlannedResearchPacket must not re-decompose
// the question, and must not re-INFER jurisdiction from the generated task
// text either -- confirmed bug: resolveJurisdictionAndState's regex-based
// inference requires either a branch-noun keyword (legislature, attorney
// general, governor, court, HB/SB number) in the task text or a
// state_legislation/federal_legislation intent on the OUTER question,
// neither of which a constructed task like "...California Consumer
// Privacy Act (CCPA) in California..." reliably produces -- so every
// entity-derived task silently fell back to jurisdiction=federal,
// state=null, and search fell back to the generic site:gov OR site:mil
// floor instead of California's own domains, for all five states in a
// five-state comparison, every time. The planner already knows the
// answer; making the resolver re-derive it from prose it doesn't control
// is throwing away information that was already correct.
export interface PlannedTask {
  task: string;
  sectionKey: string;
  jurisdiction: Jurisdiction;
  state: string | null;
}

export async function buildPlannedResearchPacket(
  question: string,
  intents: Set<PoliticalIntent>,
  jurisdiction: Jurisdiction,
  state: string | null,
  onStage?: (label: string) => void,
  userId?: string,
  precomputedTasks?: PlannedTask[],
): Promise<ResearchPacket> {
  onStage?.("Planning research");
  const tasks = precomputedTasks ? precomputedTasks.map((t) => t.task) : await planResearchTasks(question, userId);

  onStage?.(`Researching ${tasks.length} topic${tasks.length === 1 ? "" : "s"} independently`);
  // allSettled, not all -- one task throwing must never take down the
  // others. Each task's own retrieval already retries once internally on
  // weak evidence (buildResearchPacket -> runSearchWithRetry) before it
  // would ever end up here as "insufficient."
  //
  // Fix 2 (per-subtask jurisdiction): re-resolve jurisdiction/state from
  // EACH task's own text instead of reusing the outer, whole-question
  // resolution for every task -- a 5-state comparison question resolves to
  // exactly ONE outer state (whichever the whole sentence matched first),
  // and reusing that for every subtask routed 4 of 5 states' searches at
  // the wrong state's official domains (the confirmed root cause of the
  // civil-asset-forfeiture audit). Reuses the outer, already-classified
  // `intents` Set rather than re-classifying each short task fragment --
  // a fragment like "the burden-of-proof standard" won't independently
  // re-trigger the state_legislation intent that resolveJurisdictionAndState
  // needs to override a bare state name into "state" jurisdiction, so
  // re-classifying risks silently losing that override. Falls back to null
  // (the generic .gov/.mil floor), NEVER to the outer state, when a task's
  // own text doesn't name one -- falling back to the outer state would just
  // reintroduce the original bug for exactly the tasks whose decomposition
  // didn't restate their state as instructed above.
  // Resolved once and reused below (both for the search call and for the
  // section heading each task must use) -- see the sectionKey handling in
  // the forEach below for why this needs to survive past the search call.
  // Precomputed tasks carry their own already-correct jurisdiction/state
  // straight from the planner -- authoritative, never re-inferred from the
  // generated task text (see PlannedTask's doc comment for why that
  // inference is unreliable). Only the freeform LLM-decomposition path
  // (no precomputedTasks) still needs resolveJurisdictionAndState at all.
  const taskResolutions = precomputedTasks
    ? precomputedTasks.map((t) => ({ jurisdiction: t.jurisdiction, state: t.state }))
    : tasks.map((task) => resolveJurisdictionAndState(task, intents));
  const settled = await Promise.allSettled(
    tasks.map((task, i) => {
      const { jurisdiction: taskJurisdiction, state: taskState } = taskResolutions[i];
      return buildResearchPacket(task, intents, taskJurisdiction, taskState, { maxSearchResults: PLANNED_SEARCH_COUNT });
    }),
  );

  const sections: string[] = [];
  const allSources: TieredSource[] = [];
  // Per-section source scoping: a precomputed task already carries its own
  // section key (the specific entity it's about -- a law name, a case name,
  // anything, not just a US state). Without precomputed tasks, only tasks
  // with a resolved state get a section key -- this is specifically about
  // state-decomposed questions (the confirmed cross-state citation-reuse
  // case), not every possible multi-part decomposition. A task with no key
  // either way still contributes its sources to the merged pool above, just
  // without cross-section enforcement, matching this feature's scoped intent.
  const packetSections: { key: string; sources: TieredSource[] }[] = [];

  settled.forEach((result, i) => {
    const task = tasks[i];
    const sectionKey = precomputedTasks ? precomputedTasks[i].sectionKey : taskResolutions[i].state;
    // Required even for a section that turns out to have no evidence (the
    // "insufficient" branch below) -- a section must stay isolable by
    // heading regardless of how much content ends up under it, or the
    // post-generation section-scope validator has nothing to split on.
    const headingInstruction = sectionKey
      ? `Before writing anything else for this task, start with a level-2 markdown heading that is EXACTLY ` +
        `"## ${sectionKey}" on its own line, with nothing else on that line -- no extra words, no bill name, ` +
        "no punctuation. Cite ONLY sources listed for THIS specific task below -- never a source that belongs " +
        "to a different section, even if it's genuinely official; a citation is checked against this response " +
        "before it's shown to anyone, and one borrowed from another section will be caught and replaced.\n\n"
      : "";
    if (result.status === "fulfilled") {
      const packet = result.value;
      allSources.push(...packet.sources);
      if (sectionKey) packetSections.push({ key: sectionKey, sources: packet.sources });
      const weaknessNote =
        packet.confidence === "low"
          ? "\n\nThis section's evidence was insufficient even after an automatic broadened retry -- write " +
            `exactly this sentence for this part of the answer: "${INSUFFICIENT_SECTION_PHRASE}" You may add ` +
            "relevant general knowledge AFTER that sentence, but only if you clearly label it \"General " +
            "background (not verified via retrieval):\" first -- never blend it into the answer as if it were " +
            "sourced, and never let this section's weakness affect how you write any OTHER section."
          : "";
      sections.push(`${headingInstruction}Research task: ${task}\n\n${packet.liveData}${weaknessNote}`);
    } else {
      if (sectionKey) packetSections.push({ key: sectionKey, sources: [] });
      sections.push(
        `${headingInstruction}Research task: ${task}\n\n[This specific research task could not be completed due ` +
          `to an unexpected retrieval error. Write exactly this sentence for this part of the answer: ` +
          `"${INSUFFICIENT_SECTION_PHRASE}" Do not speculate about the cause -- no claims about the site ` +
          "blocking automated access, security restrictions, or a formatting problem, unless the retrieval " +
          "system explicitly reported that as the reason (it did not here). Then continue with the other " +
          "topics below; do not let this failure affect any other section or the rest of the response.]",
      );
    }
  });

  const sources = sortByAuthority(dedupeByUrl(allSources));
  const sectionConfidences = settled.map(sectionConfidence);
  const confidence = computeOverallConfidence(sectionConfidences);
  const supportedCount = sectionConfidences.filter((c) => c !== "low").length;

  const liveData = [
    `Research plan: this question was broken into ${tasks.length} independent research task(s), each retrieved ` +
      `separately so unrelated topics don't dilute or blur each other's search results. ${supportedCount} of ` +
      `${tasks.length} task(s) returned sufficient evidence.`,
    "Write ONE coherent response that addresses every task below -- organize it so a reader can tell which part " +
      "covers which topic (headings or clearly labeled paragraphs, whichever reads more naturally for this " +
      "question). Generate every section that has sufficient evidence normally and fully -- retrieval succeeding " +
      "for most topics is not a reason to hedge or shorten those sections. Retrieval is NOT all-or-nothing: if a " +
      "specific section below is marked as having insufficient evidence or as unable to be completed, write " +
      "exactly the required sentence for THAT section only, then continue on to the remaining topics -- never " +
      "let one weak or failed section cause you to refuse the whole response, and never let it cause you to " +
      "discard, water down, or replace with vague general knowledge a DIFFERENT section that actually has good " +
      "evidence. Prioritize retrieved official sources over your own general knowledge for every section; only " +
      "fall back to general knowledge for a section with no retrieved sources, and when you do, label it " +
      "explicitly as \"General background (not verified via retrieval):\" rather than presenting it as verified " +
      "research. Never speculate about WHY a specific retrieval came back empty -- no claims about website " +
      "blocks, security restrictions, formatting problems, or other technical failures -- unless the retrieval " +
      "system's own note below explicitly says so.\n\n" +
      `The "${INSUFFICIENT_SECTION_PHRASE}" sentence above covers a WHOLE section with no usable evidence at ` +
      "all. A narrower case needs different handling: within a section that DOES have sufficient evidence " +
      "overall, one specific requested field (a sponsor, a specific date, a court decision, a penalty amount, " +
      "a specific figure) may still have nothing retrieved to support it. For that specific field only, write " +
      "exactly \"Not verified from retrieved official sources\" in place of a value -- never infer, estimate, " +
      "or carry over a plausible-sounding value from general knowledge of how similar bills/cases/states " +
      "typically work, and never silently omit the field instead of stating this. Write that sentence as plain " +
      "text, never as a hyperlink or markdown reference (e.g. never `[Source](Not verified from retrieved " +
      "official sources)`) -- it is a caveat, not a citation, and dressing it up as a link visually promises a " +
      "source that does not exist. Every cited source must " +
      "itself be one that was actually retrieved for that section -- never cite a URL, case, or report you " +
      "did not see in the material below, no matter how plausible or well-known it sounds; treat any citation " +
      "you're not certain came from the retrieved text as a claim to remove, not a detail to include. Sources " +
      "are SECTION-SCOPED: a source retrieved for one section (e.g. Florida) must never be cited in a " +
      "different section's part of the answer (e.g. Virginia), even though it's genuinely official and even " +
      "though every section's sources are listed together below -- each section's own material is the only " +
      "material that section may cite. This is checked mechanically after you write the response, and any " +
      "citation borrowed from another section will be caught and replaced before anyone sees it.",
    ...sections,
  ].join("\n\n---\n\n");

  const confidenceReason =
    `${supportedCount} of ${tasks.length} independently researched topic(s) had sufficient evidence ` +
    `(confidence reflects that proportion, not just the weakest section). ` +
    buildConfidenceReason(confidence, sources, confidence === "high");

  // Not used to hard-gate generation here -- the multi-part planner path is
  // deliberately exempted from skipModel (see app/api/chat/route.ts: "Never
  // skip generation for the multi-part path -- graceful degradation...").
  // Computed anyway so this ResearchPacket is honest about the field, and
  // so a future caller that DOES want the aggregate signal has it available.
  const retrievalFailed = settled.every((result) => result.status !== "fulfilled" || result.value.retrievalFailed);

  return {
    intents: Array.from(intents),
    jurisdiction,
    state,
    sources,
    liveData,
    confidence,
    confidenceReason,
    retrievalFailed,
    sections: packetSections.length > 0 ? packetSections : undefined,
  };
}

// Research Planning: understand the question BEFORE issuing any search.
// Every research path today either regex-extracts entities the user already
// typed (extractComparisonTargets, extractBillNumber) or hands the raw/
// decomposed question straight to the search provider and relies on organic
// results to surface the right real-world laws/bills/cases. That breaks
// down exactly on a question like "Compare the five strongest state
// consumer privacy laws" -- it names zero explicit entities, so nothing
// regex-extractable exists, and a single generic search query is left to
// organically discover California's CCPA/CPRA, Virginia's VCDPA, etc. on
// its own. This module uses the model's own knowledge to name the specific
// candidate entities a question needs BEFORE any search runs, so retrieval
// can verify/retrieve documents for known entities instead of discovering
// them via broad search.
import { getProvider } from "@/lib/ai/get-provider";
import type { Jurisdiction } from "@/lib/intelligence/jurisdiction";
import { runSearchForMessage, type SearchOutcome } from "@/lib/search/orchestrate";
import { STATE_OFFICIAL_DOMAINS, type JurisdictionScope } from "@/lib/search/source-router";
import { MAX_RESEARCH_TASKS } from "./planner";

export type ResearchEntityType = "bill" | "statute" | "court_case" | "agency_guidance" | "regulation" | "budget" | "other";
export type ResearchRequestType = "enacted" | "pending" | "comparison" | "historical" | "current_status";

export interface ResearchPlanEntity {
  // Canonical, searchable name -- e.g. "California CCPA/CPRA", not just
  // "California" -- this string is what eventually anchors that entity's
  // own search query, so it needs to be specific enough to search well on
  // its own.
  name: string;
  jurisdiction: string | null;
  // 0-100: how certain the model is that this is the CORRECT, EXACT,
  // dedicated entity for the specific subject requested -- not merely that
  // a law with this name exists. Confirmed gap: the model would name a
  // well-known but topically BROADER law (e.g. California's CCPA) in place
  // of a state's actual dedicated statute on a narrower requested subject
  // (e.g. data broker regulation specifically) -- this score is what lets
  // that substitution be caught and verified instead of silently trusted.
  confidence: number;
}

export interface ResearchPlan {
  topic: string;
  jurisdiction: JurisdictionScope;
  entityType: ResearchEntityType;
  requestType: ResearchRequestType;
  reasoning: string;
  entities: ResearchPlanEntity[];
}

const ENTITY_TYPES: ResearchEntityType[] = ["bill", "statute", "court_case", "agency_guidance", "regulation", "budget", "other"];
const REQUEST_TYPES: ResearchRequestType[] = ["enacted", "pending", "comparison", "historical", "current_status"];
const JURISDICTION_SCOPES: JurisdictionScope[] = ["federal", "state", "local", "mixed"];

interface PlanFallback {
  jurisdiction: Jurisdiction;
  state: string | null;
}

// The safety property this whole module depends on: when planning fails or
// can't confidently name anything, entities is empty, and every downstream
// caller (app/api/chat/route.ts) treats an empty entities list as "behave
// exactly like today" -- this stage can only ever ADD coverage, never
// remove it, because a degenerate plan is indistinguishable from "planning
// found nothing to add."
function fallbackPlan(question: string, fallback: PlanFallback, reasoning: string): ResearchPlan {
  return {
    topic: question,
    jurisdiction: fallback.jurisdiction,
    entityType: "other",
    requestType: "current_status",
    reasoning,
    entities: [],
  };
}

function buildPrompt(question: string): string {
  return (
    "You are analyzing a research question BEFORE any web search happens, so the search that follows can be " +
    "targeted at specific, real documents instead of guessing from a generic query. Given the question below, " +
    "determine:\n\n" +
    "1. TOPIC: one concise phrase naming what this question is actually about.\n" +
    "2. JURISDICTION: exactly one of federal, state, local, or mixed (mixed only if the question explicitly " +
    "spans more than one level, e.g. comparing a state law to federal law).\n" +
    "3. ENTITY_TYPE: exactly one of bill, statute, court_case, agency_guidance, regulation, budget, other -- " +
    "whichever best describes the kind of official record(s) this question is ultimately about.\n" +
    "4. REQUEST_TYPE: exactly one of enacted, pending, comparison, historical, current_status -- what the user " +
    "actually wants to know.\n" +
    "5. REASONING: one or two sentences explaining your interpretation.\n" +
    "6. ENTITIES: the SPECIFIC real, named things (laws, bills, cases, regulations, agencies) this question " +
    "needs information about. If the question already names them explicitly, list exactly those -- do not add " +
    "more. If the question describes a category or comparison WITHOUT naming specific entities, first identify " +
    "the EXACT legal subject being asked about, not just its general topic area -- a request about \"data " +
    "broker regulation\" is asking about a narrower, distinct subject than \"consumer privacy\" in general, " +
    "even though the two overlap and a state's general privacy law may briefly touch on data brokers too. For " +
    "each candidate entity, explicitly judge whether it is a DEDICATED, PRIMARY law on the exact subject " +
    "requested, or a BROADER or ADJACENT law that merely has a section touching on it -- prefer the former, " +
    "and never substitute the latter for it. Prominence or fame is NOT a selection criterion: a state's more " +
    "famous general-purpose law is not a valid substitute for its specific dedicated statute on the requested " +
    "subject, even when you are more confident the famous one exists. If you cannot confidently name the " +
    "dedicated statute for a given jurisdiction, either include it with a low CONFIDENCE score (below) rather " +
    "than silently upgrading to that jurisdiction's more famous adjacent law, or omit that jurisdiction " +
    "entirely. Only list an entity you are reasonably confident actually exists -- if you cannot confidently " +
    "name real entities, leave this section empty rather than inventing plausible-sounding ones. If the " +
    "question is about a single topic with no natural list of distinct entities, list zero or one.\n" +
    "7. For each entity, also give a CONFIDENCE score from 0 to 100: how certain you are that this is the " +
    "CORRECT, EXACT, dedicated entity for the specific subject requested -- not merely that a law with this " +
    "name exists. A well-known but topically broader substitute must score LOW, even if you are fully " +
    "confident that law itself is real -- confidence measures precision to the request, not existence. This " +
    "score must reflect YOUR OWN actual certainty for EACH entity INDIVIDUALLY -- never assign the same score " +
    "to every entity in the list by default or out of habit. Your certainty almost always genuinely varies " +
    "across a list like this (you know some jurisdictions' dedicated statutes precisely and others only " +
    "approximately), and the scores must show that real variation, not a single flat number restated for " +
    "each line.\n\n" +
    "Reply in EXACTLY this format, nothing else:\n" +
    "TOPIC: ...\n" +
    "JURISDICTION: ...\n" +
    "ENTITY_TYPE: ...\n" +
    "REQUEST_TYPE: ...\n" +
    "REASONING: ...\n" +
    "ENTITIES:\n" +
    "- <entity name> | <jurisdiction, or \"federal\" if none> | <confidence 0-100>\n" +
    "- <entity name> | <jurisdiction, or \"federal\" if none> | <confidence 0-100>\n\n" +
    `Question: ${question}`
  );
}

function extractLabel(raw: string, label: string): string | null {
  const match = raw.match(new RegExp(`^${label}:\\s*(.+)$`, "im"));
  return match ? match[1].trim() : null;
}

function parseEntities(raw: string): ResearchPlanEntity[] {
  const sectionMatch = raw.match(/^ENTITIES:\s*([\s\S]*)$/im);
  if (!sectionMatch) return [];

  const entities: ResearchPlanEntity[] = [];
  for (const line of sectionMatch[1].split("\n")) {
    const bulletMatch = line.match(/^\s*[-*]\s*(.+)$/);
    if (!bulletMatch) continue;
    const [namePart, jurisdictionPart, confidencePart] = bulletMatch[1].split("|").map((s) => s.trim());
    if (!namePart) continue;
    const jurisdiction = !jurisdictionPart || /^federal$/i.test(jurisdictionPart) ? null : jurisdictionPart;
    // Missing/unparseable confidence defaults to 50 (mid-value, triggers
    // verification) rather than discarding the entity -- matches this
    // file's existing "degrade gracefully, don't fail the whole thing"
    // convention for a model that didn't follow the format exactly.
    const parsedConfidence = confidencePart ? Number.parseInt(confidencePart, 10) : NaN;
    const confidence = Number.isFinite(parsedConfidence) ? Math.min(100, Math.max(0, parsedConfidence)) : 50;
    entities.push({ name: namePart, jurisdiction, confidence });
  }
  return entities.slice(0, MAX_RESEARCH_TASKS);
}

// Pure parsing, independently testable without mocking the LLM call --
// mirrors this codebase's only existing convention for reading model output
// (planResearchTasks/decomposeQuestion: labeled/line-based freeform text,
// defensively parsed, falling back to a safe default on anything that
// doesn't look right). No provider in this codebase exposes JSON-mode or
// tool-calling today, so a hand-rolled labeled format is the honest choice
// here, not a shortcut.
export function parseResearchPlan(raw: string, question: string, fallback: PlanFallback): ResearchPlan {
  const topic = extractLabel(raw, "TOPIC");
  if (!topic) return fallbackPlan(question, fallback, "Planning response could not be parsed.");

  const jurisdictionRaw = extractLabel(raw, "JURISDICTION")?.toLowerCase() ?? "";
  const jurisdiction = (JURISDICTION_SCOPES as string[]).includes(jurisdictionRaw)
    ? (jurisdictionRaw as JurisdictionScope)
    : fallback.jurisdiction;

  const entityTypeRaw = extractLabel(raw, "ENTITY_TYPE")?.toLowerCase() ?? "";
  const entityType = (ENTITY_TYPES as string[]).includes(entityTypeRaw) ? (entityTypeRaw as ResearchEntityType) : "other";

  const requestTypeRaw = extractLabel(raw, "REQUEST_TYPE")?.toLowerCase() ?? "";
  const requestType = (REQUEST_TYPES as string[]).includes(requestTypeRaw)
    ? (requestTypeRaw as ResearchRequestType)
    : "current_status";

  const reasoning = extractLabel(raw, "REASONING") ?? "";
  const entities = parseEntities(raw);

  return { topic, jurisdiction, entityType, requestType, reasoning, entities };
}

// Confirmed live, twice, despite the precision-first prompt instruction
// above: for a "data broker" specific request, the model repeatedly names
// California's CCPA/CPRA (AB 375/2018, amended by the CPRA/Prop 24/2020,
// Cal. Civ. Code SS1798.100 et seq.) -- a BROADER general consumer-privacy
// law that does not itself contain data-broker registration or deletion-
// platform provisions -- instead of California's actual dedicated data-
// broker regime: the Data Broker Registration Law (AB 1202/2019), as
// amended by the Delete Act (SB 362/2023) to add centralized DROP deletion
// and CPPA oversight, Cal. Civ. Code SS1798.99.80 et seq. The model
// consistently reports HIGH confidence in this substitution (CCPA is
// extremely prominent in training data), so the confidence-gated
// verification search above doesn't catch it -- it's a targeted check for
// the model's OWN flagged uncertainty, not a defense against confident
// wrongness. This is a deterministic override for this specific,
// now-repeatedly-confirmed substitution, not a general pattern -- narrowly
// scoped to California + a data-broker-specific topic, so it can't affect
// any other jurisdiction or subject.
const DATA_BROKER_TOPIC_RE = /\bdata broker/i;
const CCPA_ENTITY_RE = /\b(?:CCPA|California Consumer Privacy Act|CPRA|California Privacy Rights Act)\b/i;
const CALIFORNIA_DATA_BROKER_OWN_SCOPE_RE = /\bDelete Act\b|\bSB\s?362\b|\bAB\s?1202\b|\bdata broker regist/i;
const CALIFORNIA_DATA_BROKER_ENTITY_NAME =
  "California Delete Act (SB 362) / Data Broker Registration Law (Cal. Civ. Code § 1798.99.80 et seq.)";

// Runs after parsing, before verification -- a corrected entity is exact
// and known-real, not merely more confident, so it skips the low-confidence
// verification search entirely rather than being routed through it.
export function correctKnownEntitySubstitutions(plan: ResearchPlan): ResearchPlan {
  if (!DATA_BROKER_TOPIC_RE.test(plan.topic)) return plan;

  let corrected = false;
  const entities = plan.entities.map((e) => {
    if (
      e.jurisdiction?.toLowerCase() !== "california" ||
      !CCPA_ENTITY_RE.test(e.name) ||
      CALIFORNIA_DATA_BROKER_OWN_SCOPE_RE.test(e.name)
    ) {
      return e;
    }
    corrected = true;
    return { ...e, name: CALIFORNIA_DATA_BROKER_ENTITY_NAME, confidence: 100 };
  });
  if (corrected) {
    console.warn(
      `[research-plan] corrected known entity substitution: California CCPA/CPRA -> ${CALIFORNIA_DATA_BROKER_ENTITY_NAME} (topic: "${plan.topic}")`,
    );
  }
  return corrected ? { ...plan, entities } : plan;
}

// Entities the model itself flagged as uncertain (see the CONFIDENCE
// instruction in buildPrompt) get ONE targeted search before they're
// trusted -- confirmed live: a low-confidence entity is exactly where the
// model tends to substitute a well-known adjacent law for the dedicated
// statute it isn't sure of, so this is the highest-value place to check.
//
// Confirmed live gap: despite the prompt explicitly asking for per-entity
// differentiation, the model sometimes still assigns the SAME score to
// every entity in a list (70 across the board in one run, 80 in another)
// rather than genuinely varying confidence -- when that score happens to
// land exactly on the threshold, a strict "<" comparison lets it slip
// through unverified. Deliberately inclusive ("<=") rather than raising
// the threshold itself further, since the observed flat scores varied (70,
// then 80) -- no single fixed cutoff reliably sits below every value the
// model might flatten to, but "at or below a genuinely high bar" does.
const ENTITY_VERIFICATION_CONFIDENCE_THRESHOLD = 85;

// Words that don't distinguish this entity from any other law -- checking
// for their presence in a search result would "confirm" almost anything.
const ENTITY_NAME_STOPWORDS = new Set([
  "the", "of", "and", "or", "for", "a", "an", "act", "acts", "law", "laws",
  "regulation", "regulations", "statute", "statutes", "bill", "bills", "code",
]);

// The words that actually distinguish this entity's name from a generic
// law in the same jurisdiction -- e.g. "data", "broker", "delete", "ccpa"
// for "California Consumer Privacy Act (CCPA)", not "california" (the
// jurisdiction, checked separately downstream) or "act" (true of every
// statute). Used to check whether a search result is actually ABOUT this
// specific entity, not just about the same state in general.
function distinctiveWords(entityName: string, jurisdiction: string | null): string[] {
  const jurisdictionWords = new Set((jurisdiction ?? "").toLowerCase().split(/\s+/));
  return entityName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !ENTITY_NAME_STOPWORDS.has(w) && !jurisdictionWords.has(w));
}

function isConfirmedByResults(words: string[], sources: SearchOutcome["sources"]): boolean {
  if (!sources || sources.length === 0 || words.length === 0) return false;
  return sources.some((s) => {
    const haystack = `${s.title} ${s.url}`.toLowerCase();
    return words.some((w) => haystack.includes(w));
  });
}

function domainsForState(state: string): string[] {
  const entry = STATE_OFFICIAL_DOMAINS[state];
  if (!entry) return [];
  const legislature = Array.isArray(entry.legislature) ? entry.legislature : entry.legislature ? [entry.legislature] : [];
  return [...legislature, ...(entry.agency ? [entry.agency] : [])];
}

// Injectable purely for testing -- the real default is the actual search
// layer, but this lets verifyLowConfidenceEntities' branching (confirmed /
// dropped / kept-on-error) be tested without a real network call.
type SearchFn = (query: string, maxResults: number, options?: { includeDomains?: string[] }) => Promise<SearchOutcome>;

async function verifyEntity(
  entity: ResearchPlanEntity,
  searchFn: SearchFn,
): Promise<{ keep: boolean; outcome: string }> {
  const words = distinctiveWords(entity.name, entity.jurisdiction);
  const includeDomains = entity.jurisdiction ? domainsForState(entity.jurisdiction) : [];

  try {
    const result = await searchFn(entity.name, 3, includeDomains.length > 0 ? { includeDomains } : undefined);
    const confirmed = isConfirmedByResults(words, result.sources);
    return { keep: confirmed, outcome: confirmed ? "confirmed" : "no confirming source found -- dropping" };
  } catch (err) {
    // A failed check means "unknown," not "disproven" -- dropping here
    // would penalize the entity for an infrastructure failure that has
    // nothing to do with whether it's actually correct.
    return { keep: true, outcome: `verification check failed (${err instanceof Error ? err.message : "error"}) -- keeping, unknown not disproven` };
  }
}

// Runs all verifications in parallel (one extra round-trip's worth of
// latency total, not one per low-confidence entity) and returns the
// original entity list with any unconfirmed ones removed. Entities STRICTLY
// ABOVE the confidence threshold are returned untouched, unverified -- this
// is a targeted check for the model's OWN flagged uncertainty, not a
// blanket re-verification of everything.
export async function verifyLowConfidenceEntities(
  entities: ResearchPlanEntity[],
  searchFn: SearchFn = runSearchForMessage,
): Promise<ResearchPlanEntity[]> {
  const lowConfidence = entities.filter((e) => e.confidence <= ENTITY_VERIFICATION_CONFIDENCE_THRESHOLD);
  if (lowConfidence.length === 0) return entities;

  const results = await Promise.allSettled(lowConfidence.map((e) => verifyEntity(e, searchFn)));
  const dropped = new Set<ResearchPlanEntity>();
  results.forEach((r, i) => {
    const entity = lowConfidence[i];
    if (r.status === "fulfilled") {
      console.log(`[research-plan] verification for "${entity.name}" (confidence ${entity.confidence}): ${r.value.outcome}`);
      if (!r.value.keep) dropped.add(entity);
    } else {
      console.warn(`[research-plan] verification threw for "${entity.name}":`, r.reason);
    }
  });
  return entities.filter((e) => !dropped.has(e));
}

export async function planResearch(question: string, fallback: PlanFallback, userId?: string): Promise<ResearchPlan> {
  const provider = await getProvider(userId);
  if (!(await provider.isConfigured())) {
    return fallbackPlan(question, fallback, "Planning unavailable -- no AI provider configured.");
  }

  let result = "";
  try {
    await provider.streamChat([{ role: "user", content: buildPrompt(question) }], (piece) => {
      result += piece;
    });
  } catch {
    return fallbackPlan(question, fallback, "Planning request failed.");
  }

  const plan = correctKnownEntitySubstitutions(parseResearchPlan(result, question, fallback));
  const verifiedEntities = await verifyLowConfidenceEntities(plan.entities);
  return { ...plan, entities: verifiedEntities };
}

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
import type { JurisdictionScope } from "@/lib/search/source-router";
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
    "more. If the question describes a category or comparison WITHOUT naming specific entities (e.g. \"the five " +
    "strongest state consumer privacy laws\"), use your own knowledge to name the most likely REAL, well-known " +
    "entities that satisfy the request -- for example, for state consumer privacy laws: California's CCPA/CPRA, " +
    "Virginia's VCDPA, Colorado's Privacy Act, Connecticut's CTDPA, Utah's UCPA. Only list an entity you are " +
    "reasonably confident actually exists -- if you cannot confidently name real entities, leave this section " +
    "empty rather than inventing plausible-sounding ones. If the question is about a single topic with no " +
    "natural list of distinct entities, list zero or one.\n\n" +
    "Reply in EXACTLY this format, nothing else:\n" +
    "TOPIC: ...\n" +
    "JURISDICTION: ...\n" +
    "ENTITY_TYPE: ...\n" +
    "REQUEST_TYPE: ...\n" +
    "REASONING: ...\n" +
    "ENTITIES:\n" +
    "- <entity name> | <jurisdiction, or \"federal\" if none>\n" +
    "- <entity name> | <jurisdiction, or \"federal\" if none>\n\n" +
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
    const [namePart, jurisdictionPart] = bulletMatch[1].split("|").map((s) => s.trim());
    if (!namePart) continue;
    const jurisdiction = !jurisdictionPart || /^federal$/i.test(jurisdictionPart) ? null : jurisdictionPart;
    entities.push({ name: namePart, jurisdiction });
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

  return parseResearchPlan(result, question, fallback);
}

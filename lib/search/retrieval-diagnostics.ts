import { isProductionDeployment } from "@/lib/env";

// Detailed, per-query retrieval tracing. Printed whenever NOT in production,
// OR when DEBUG_RETRIEVAL=1 is set -- routine production traffic must never
// pay for this in log volume, but a production-only symptom (the wrong
// search provider behaving differently than local dev, e.g.) is exactly the
// kind of thing that's invisible if this stays permanently dev-only, so an
// explicit opt-in override exists for actually debugging a live report.
function shouldTrace(): boolean {
  return !isProductionDeployment() || process.env.DEBUG_RETRIEVAL === "1";
}

export interface RetrievalDiagnostics {
  // (0) The jurisdiction-aware routing verdict, recorded BEFORE any provider
  // is selected or a search executes -- the direct answer to "why weren't
  // federal sources used for this state query" (or the reverse).
  jurisdictionRouting?: {
    jurisdiction: string;
    state: string | null;
    scope: string;
    includeFederalSources: boolean;
    excludedFederalLabels: string[];
    reason: string;
  };
  routerInvoked: boolean;
  officialDomains: string[];
  officialLabels: string[];
  searchQueries: { phase: string; query: string }[];
  // (2) Full raw results per phase, in the search API's own original order,
  // before any filtering or re-ranking of ours -- what the provider
  // actually handed back for this exact query.
  rawResults: { phase: string; title: string; url: string; snippet: string }[];
  resultsPerDomain: Record<string, number>;
  // (3) Every raw result that did NOT become a fetch candidate, with why --
  // social-media exclusion, or ranked below MAX_PAGES_TO_FETCH.
  filteredOut: { phase: string; url: string; title: string; reason: string }[];
  // (4) The ranked candidate list actually chosen for fetching, in rank
  // order with each one's relevance AND authority score -- "why was X
  // selected over Y" is answered directly by comparing both numbers, not
  // just authority (relevance is the primary sort key; see rankingScore in
  // orchestrate.ts).
  candidates: {
    phase: string;
    url: string;
    title: string;
    authorityRank: number;
    relevanceRatio: number;
    titleMatch: boolean;
    fetchStatus: "success" | "failed" | "pending";
  }[];
  // (5) The key diagnostic for "why weren't official domains chosen, if
  // they exist": for any phase that specifically requested official
  // domains, which of those requested domains never appeared ANYWHERE in
  // the raw provider results at all. A domain listed here means the search
  // provider itself never returned it for this query -- a retrieval-source
  // problem, not a ranking or filtering problem (ranking/filtering can only
  // ever act on what was actually returned).
  officialDomainMisses: { phase: string; requestedDomains: string[]; missingDomains: string[] }[];
  documentsProvided: { url: string; title: string }[];
}

export function createRetrievalDiagnostics(): RetrievalDiagnostics {
  return {
    routerInvoked: false,
    officialDomains: [],
    officialLabels: [],
    searchQueries: [],
    rawResults: [],
    resultsPerDomain: {},
    filteredOut: [],
    candidates: [],
    officialDomainMisses: [],
    documentsProvided: [],
  };
}

// Only ever create a real diagnostics object when tracing is actually on --
// callers hold onto the (possibly undefined) result and pass it straight
// through; every record* function below already tolerates undefined.
export function maybeCreateRetrievalDiagnostics(): RetrievalDiagnostics | undefined {
  return shouldTrace() ? createRetrievalDiagnostics() : undefined;
}

export function recordJurisdictionRouting(
  diag: RetrievalDiagnostics | undefined,
  routing: {
    jurisdiction: string;
    state: string | null;
    scope: string;
    includeFederalSources: boolean;
    excludedFederalLabels: string[];
    reason: string;
  },
): void {
  if (!diag) return;
  diag.jurisdictionRouting = routing;
}

export function recordRouterInvocation(diag: RetrievalDiagnostics | undefined, domains: string[], labels: string[]): void {
  if (!diag) return;
  diag.routerInvoked = true;
  diag.officialDomains = domains;
  diag.officialLabels = labels;
}

export function recordSearchQuery(diag: RetrievalDiagnostics | undefined, phase: string, query: string): void {
  diag?.searchQueries.push({ phase, query });
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function recordRawResults(
  diag: RetrievalDiagnostics | undefined,
  phase: string,
  results: { title: string; url: string; snippet: string }[],
): void {
  if (!diag) return;
  for (const r of results) {
    diag.rawResults.push({ phase, title: r.title, url: r.url, snippet: r.snippet });
    const host = hostnameOf(r.url);
    diag.resultsPerDomain[host] = (diag.resultsPerDomain[host] ?? 0) + 1;
  }
}

// The (5) diagnostic: only meaningful when this phase actually requested
// specific official domains (requestedDomains non-empty). A requested
// domain counts as "found" if ANY raw result's hostname matches it exactly
// or is a subdomain of it -- otherwise it's a genuine miss.
export function recordOfficialDomainCheck(
  diag: RetrievalDiagnostics | undefined,
  phase: string,
  requestedDomains: string[],
  results: { url: string }[],
): void {
  if (!diag || requestedDomains.length === 0) return;
  const resultHosts = results.map((r) => hostnameOf(r.url));
  const missingDomains = requestedDomains.filter(
    (d) => !resultHosts.some((host) => host === d || host.endsWith(`.${d}`)),
  );
  diag.officialDomainMisses.push({ phase, requestedDomains, missingDomains });
}

export function recordFiltered(
  diag: RetrievalDiagnostics | undefined,
  phase: string,
  url: string,
  title: string,
  reason: string,
): void {
  diag?.filteredOut.push({ phase, url, title, reason });
}

export function recordCandidate(
  diag: RetrievalDiagnostics | undefined,
  phase: string,
  url: string,
  title: string,
  authorityRank: number,
  relevance: { ratio: number; titleMatch: boolean },
): void {
  diag?.candidates.push({
    phase,
    url,
    title,
    authorityRank,
    relevanceRatio: relevance.ratio,
    titleMatch: relevance.titleMatch,
    fetchStatus: "pending",
  });
}

function markCandidateStatus(diag: RetrievalDiagnostics | undefined, url: string, status: "success" | "failed"): void {
  const candidate = diag?.candidates.find((c) => c.url === url && c.fetchStatus === "pending");
  if (candidate) candidate.fetchStatus = status;
}

export function recordFetchSuccess(diag: RetrievalDiagnostics | undefined, url: string): void {
  markCandidateStatus(diag, url, "success");
}

export function recordFetchFailure(diag: RetrievalDiagnostics | undefined, url: string): void {
  markCandidateStatus(diag, url, "failed");
}

export function recordDocumentsProvided(diag: RetrievalDiagnostics | undefined, documents: { url: string; title: string }[]): void {
  if (!diag) return;
  diag.documentsProvided = documents;
}

// Printed ONCE per question, separate from the per-task printRetrievalDiagnostics
// blocks below (those run once per buildResearchPacket call -- i.e. once per
// entity in a multi-entity plan -- so embedding the plan's reasoning there
// would print it N times redundantly). Structurally typed rather than
// importing ResearchPlan from lib/research/research-plan.ts, matching this
// file's existing precedent (see hasOfficialCitation in
// lib/research/source-attribution.ts) of avoiding a cross-module dependency
// for a shape this file only ever reads, never constructs.
export function printResearchPlan(
  question: string,
  plan: {
    topic: string;
    jurisdiction: string;
    entityType: string;
    requestType: string;
    reasoning: string;
    entities: { name: string; jurisdiction: string | null; confidence: number }[];
  },
): void {
  if (!shouldTrace()) return;
  console.group(`[research-plan] "${question.slice(0, 100)}"`);
  console.log(
    "Topic:", plan.topic,
    "| Jurisdiction:", plan.jurisdiction,
    "| Entity type:", plan.entityType,
    "| Request type:", plan.requestType,
  );
  console.log("Reasoning:", plan.reasoning || "(none given)");
  console.log(`Candidate entities (${plan.entities.length}):`, plan.entities);
  console.groupEnd();
}

// Prints the full retrieval trace: (1) search queries issued, (2) the raw
// results the search API actually returned, (3) which were filtered out and
// why, (4) the ranked fetch candidates and their authority scores (why each
// was selected), and (5) -- the diagnostic this audit specifically asked
// for -- which requested official domains never showed up in the raw
// results at all, meaning the search provider itself failed to return them
// (as opposed to our own ranking/filtering discarding them).
export function printRetrievalDiagnostics(question: string, diag: RetrievalDiagnostics): void {
  if (!shouldTrace()) return;
  console.group(`[retrieval-diagnostics] "${question.slice(0, 100)}"`);
  if (diag.jurisdictionRouting) {
    const r = diag.jurisdictionRouting;
    console.log(
      `(0) Jurisdiction routing: jurisdiction=${r.jurisdiction} state=${r.state ?? "none"} scope=${r.scope} ` +
        `includeFederalSources=${r.includeFederalSources}` +
        (r.excludedFederalLabels.length > 0 ? ` excluded=[${r.excludedFederalLabels.join(", ")}]` : "") +
        ` -- ${r.reason}`,
    );
  }
  console.log("Domain router invoked:", diag.routerInvoked, "| official domains:", diag.officialDomains, "| labels:", diag.officialLabels);
  console.log("(1) Search queries issued:", diag.searchQueries);
  console.log(`(2) Raw results returned by the search API (${diag.rawResults.length} total):`, diag.rawResults);
  console.log("    Results per domain:", diag.resultsPerDomain);
  console.log(`(3) Results filtered out before fetching (${diag.filteredOut.length}):`, diag.filteredOut);
  console.log(`(4) Ranked fetch candidates, in selection order (${diag.candidates.length}):`, diag.candidates);
  if (diag.officialDomainMisses.some((m) => m.missingDomains.length > 0)) {
    console.warn(
      "(5) OFFICIAL DOMAINS REQUESTED BUT NEVER RETURNED BY THE SEARCH PROVIDER " +
        "(the search itself failed to surface them -- not a ranking/filtering issue):",
      diag.officialDomainMisses.filter((m) => m.missingDomains.length > 0),
    );
  } else if (diag.officialDomainMisses.length > 0) {
    console.log("(5) All requested official domains were present somewhere in the raw results:", diag.officialDomainMisses);
  }
  console.log(`Documents ultimately provided to the model (${diag.documentsProvided.length}):`, diag.documentsProvided);
  console.groupEnd();
}

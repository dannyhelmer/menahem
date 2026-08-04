import type { Jurisdiction } from "@/lib/intelligence/jurisdiction";
import type { PoliticalIntent } from "@/lib/intelligence/political-intent";

// The default retrieval architecture for government-research queries: given
// what's being asked and where, decide which SPECIFIC official domains the
// search phase should be biased toward, rather than the generic
// `site:gov OR site:mil` blanket bias. Deliberately domain-biasing (search +
// fetch real pages) rather than new structured API integrations -- most of
// these sources (Illinois General Assembly, HUD, Grants.gov) have no
// practical public API, and this stays modular: a real structured provider
// (see lib/gov-data/registry.ts -- Congress.gov, FEC today) can always be
// layered on top of a topic/jurisdiction later without this router changing
// at all, since the two run as separate layers (selectGovProviders calls a
// real API first; this only governs what the web-search fallback targets).
//
// Every table here is a plain, flat extension point -- "add Ohio" or "add a
// new federal agency" is one new map entry, never a change to
// selectOfficialDomains or any caller. Coverage is intentionally partial:
// an unmapped state/topic falls through to DEFAULT_OFFICIAL_DOMAINS rather
// than guessing a domain that might not exist -- a wrong guessed domain
// would just silently search nothing, and the existing phase-2
// secondary-source fallback (see orchestrate.ts) already handles "official
// search found nothing" honestly, so there's no honesty cost to leaving a
// state/topic uncovered here until it's actually verified and added.
export interface OfficialSourceRoute {
  domains: string[];
  labels: string[];
}

function route(domains: string[], labels: string[]): OfficialSourceRoute {
  return { domains, labels };
}

export const DEFAULT_OFFICIAL_DOMAINS: OfficialSourceRoute = route(["gov", "mil"], ["official government sources"]);

// Federal topic -> official domains, keyed by the PoliticalIntent(s) that
// already identify that topic (see lib/intelligence/political-intent.ts) --
// reuses the existing classification instead of re-detecting topics here.
const FEDERAL_TOPIC_DOMAINS: Partial<Record<PoliticalIntent, OfficialSourceRoute>> = {
  federal_legislation: route(
    ["congress.gov", "federalregister.gov", "house.gov", "senate.gov"],
    ["Congress.gov", "Federal Register", "House.gov", "Senate.gov"],
  ),
  congress: route(["congress.gov", "house.gov", "senate.gov"], ["Congress.gov", "House.gov", "Senate.gov"]),
  campaign_finance: route(["fec.gov", "opensecrets.org"], ["FEC", "OpenSecrets"]),
  supreme_court: route(["supremecourt.gov", "courtlistener.com"], ["Supreme Court", "court opinions"]),
  regulations: route(["federalregister.gov", "reginfo.gov"], ["Federal Register", "reginfo.gov"]),
  executive_branch: route(["whitehouse.gov", "federalregister.gov"], ["White House", "Federal Register"]),
};

// Keyword-triggered add-ons for topics that aren't full PoliticalIntents in
// their own right (promoting them would change response SHAPE elsewhere in
// the app -- these are routing hints only, scoped to this file).
const GRANTS_RE = /\bgrants?\b/i;
const HOUSING_RE = /\bhousing\b|\bHUD\b/i;

// Federal budget documents -- state/local budgets have no single reliable
// federal-style domain, so this only applies when jurisdiction is federal
// (see selectOfficialDomains).
const FEDERAL_BUDGET_ROUTE = route(["usaspending.gov", "congress.gov"], ["USAspending.gov", "Congress.gov"]);

// State-level official domains, keyed by the title-cased state name
// detectState() already returns (e.g. "Illinois"). Seeded with the states
// this codebase already treats as canonical examples elsewhere in its
// prompts -- extend as more states are verified, never guessed.
const STATE_LEGISLATURE_DOMAINS: Record<string, string> = {
  Illinois: "ilga.gov",
  Florida: "flsenate.gov",
};
const STATE_AGENCY_DOMAINS: Record<string, string> = {
  Illinois: "illinois.gov",
  Florida: "myflorida.com",
};
const STATE_COURT_DOMAINS: Record<string, string> = {
  Illinois: "illinoiscourts.gov",
  Florida: "flcourts.gov",
};

// County/municipal official domains, keyed by "City, State" or "County,
// State". Starts empty -- this is the documented extension point for local
// coverage (thousands of jurisdictions, added incrementally as verified),
// checked by selectOfficialDomains but never required: the generic fallback
// underneath means an uncovered locality never breaks retrieval.
const LOCAL_GOVERNMENT_DOMAINS: Record<string, OfficialSourceRoute> = {};

function mergeRoutes(routes: OfficialSourceRoute[]): OfficialSourceRoute {
  const domains: string[] = [];
  const labels: string[] = [];
  const seenDomains = new Set<string>();
  const seenLabels = new Set<string>();
  for (const r of routes) {
    for (const d of r.domains) {
      if (!seenDomains.has(d)) {
        seenDomains.add(d);
        domains.push(d);
      }
    }
    for (const l of r.labels) {
      if (!seenLabels.has(l)) {
        seenLabels.add(l);
        labels.push(l);
      }
    }
  }
  return { domains, labels };
}

export function selectOfficialDomains(
  intents: Set<PoliticalIntent>,
  jurisdiction: Jurisdiction,
  state: string | null,
  questionText: string,
): OfficialSourceRoute {
  const matched: OfficialSourceRoute[] = [];

  for (const [intent, topicRoute] of Object.entries(FEDERAL_TOPIC_DOMAINS)) {
    if (intents.has(intent as PoliticalIntent)) matched.push(topicRoute);
  }
  if (GRANTS_RE.test(questionText)) matched.push(route(["grants.gov"], ["Grants.gov"]));
  if (HOUSING_RE.test(questionText)) {
    matched.push(route(["hud.gov"], ["HUD"]));
  }
  if (jurisdiction === "federal" && intents.has("budget")) matched.push(FEDERAL_BUDGET_ROUTE);

  if (jurisdiction !== "federal" && state) {
    const legislature = STATE_LEGISLATURE_DOMAINS[state];
    const agency = STATE_AGENCY_DOMAINS[state];
    const courts = STATE_COURT_DOMAINS[state];
    if (legislature) matched.push(route([legislature], [`${state} General Assembly`]));
    if (agency) matched.push(route([agency], [`${state} state agencies`]));
    if (courts && (intents.has("state_courts") || intents.has("supreme_court"))) {
      matched.push(route([courts], [`${state} courts`]));
    }

    if (jurisdiction === "local") {
      const localKey = Object.keys(LOCAL_GOVERNMENT_DOMAINS).find((k) =>
        questionText.toLowerCase().includes(k.split(",")[0].trim().toLowerCase()),
      );
      if (localKey) matched.push(LOCAL_GOVERNMENT_DOMAINS[localKey]);
    }
  }

  // DEFAULT_OFFICIAL_DOMAINS is only the fallback FLOOR, not merged
  // alongside specific matches -- once a specific official site is known
  // (e.g. ilga.gov), phase 1 should target that precisely, not be diluted
  // back down to "any .gov page" by also OR-ing in the generic bias.
  if (matched.length === 0) return DEFAULT_OFFICIAL_DOMAINS;
  return mergeRoutes(matched);
}

// Whether a route names something more specific than the generic .gov/.mil
// floor -- callers use this to decide whether a "phase 1 came up short"
// failure note is worth naming specific sources in, versus just saying
// "official sources" generically.
export function isSpecificRoute(route: OfficialSourceRoute): boolean {
  return route !== DEFAULT_OFFICIAL_DOMAINS;
}

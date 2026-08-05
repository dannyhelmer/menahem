import type { Jurisdiction } from "@/lib/intelligence/jurisdiction";
import type { PoliticalIntent } from "@/lib/intelligence/political-intent";

// Jurisdiction-aware routing classifier, run BEFORE any provider is
// selected or a search is executed. The bug this exists to fix: several
// PoliticalIntents that gate FEDERAL_TOPIC_DOMAINS below (`congress` in
// particular -- CONGRESS_RE matches the bare word "legislature") fire on
// perfectly ordinary STATE-legislation questions ("the Illinois
// legislature passed...", "Texas's state courts"), which had been silently
// merging congress.gov/house.gov/senate.gov/supremecourt.gov into a state
// query's search domains. Confirmed in production: a 5-state civil-asset-
// forfeiture comparison had Congress.gov, House.gov, Senate.gov,
// supremecourt.gov, and courtlistener.com all present in Texas's own
// includeDomains list. classifyJurisdictionRouting is the single place that
// decides whether federal sources belong in THIS query's search at all --
// selectGovProviders and selectOfficialDomains both defer to its verdict
// rather than re-deriving it themselves.
export type JurisdictionScope = "federal" | "state" | "local" | "mixed";

export interface JurisdictionRouting {
  jurisdiction: Jurisdiction;
  state: string | null;
  // "mixed" means state/local jurisdiction BUT the question explicitly also
  // asks about federal law or a federal comparison -- the one case where
  // federal sources belong in an otherwise state/local search.
  scope: JurisdictionScope;
  includeFederalSources: boolean;
  // Which federal-topic labels (Congress.gov, Supreme Court, etc.) were
  // excluded from this search -- populated only when includeFederalSources
  // is false, purely for DEBUG_RETRIEVAL visibility into what was held back
  // and why.
  excludedFederalLabels: string[];
  reason: string;
}

// A state/local question is only ALSO a federal one when it explicitly says
// so -- naming a federal law/statute/court/agency by category, "act of
// Congress"/"Congress passed", or comparing the state's law against the
// federal one. Deliberately does NOT match on bare "Congress"/"Senate"/
// "House of Representatives"/"legislature" (see CONGRESS_RE in
// political-intent.ts) -- those words alone describe a STATE legislature
// just as often as the federal one and are exactly what caused the bug.
const EXPLICIT_FEDERAL_RE =
  /\bfederal (law\w*|legislation|bill\w*|statute\w*|regulation\w*|rule\w*|court\w*|agenc\w*|government|comparison)\b|\bact of congress\b|\bcongress passed\b|\b(?:compar\w+|versus|vs\.?)\b[^.?!]{0,50}\bfederal\b|\bfederal\b[^.?!]{0,50}\b(?:compar\w+|versus|vs\.?)\b/i;

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

function allFederalTopicLabels(): string[] {
  const labels = new Set<string>();
  for (const r of Object.values(FEDERAL_TOPIC_DOMAINS)) {
    for (const l of r.labels) labels.add(l);
  }
  return Array.from(labels);
}

// The jurisdiction-aware routing classifier itself. Takes the same
// jurisdiction/state resolution every caller already computes up front (see
// resolveJurisdictionAndState) and decides, once, whether federal sources
// belong in this specific search -- every downstream consumer
// (selectGovProviders' structured-API call, selectOfficialDomains' web-
// search domain bias) defers to this single verdict instead of separately
// re-deriving it from raw intents.
export function classifyJurisdictionRouting(
  questionText: string,
  intents: Set<PoliticalIntent>,
  jurisdiction: Jurisdiction,
  state: string | null,
): JurisdictionRouting {
  if (jurisdiction === "federal") {
    return {
      jurisdiction,
      state,
      scope: "federal",
      includeFederalSources: true,
      excludedFederalLabels: [],
      reason: "question is about federal government -- federal sources included",
    };
  }

  const explicitFederalAsk = intents.has("federal_legislation") || EXPLICIT_FEDERAL_RE.test(questionText);
  return {
    jurisdiction,
    state,
    scope: explicitFederalAsk ? "mixed" : jurisdiction,
    includeFederalSources: explicitFederalAsk,
    excludedFederalLabels: explicitFederalAsk ? [] : allFederalTopicLabels(),
    reason: explicitFederalAsk
      ? `${jurisdiction} jurisdiction, but the question explicitly also asks about federal law/comparison -- federal sources included alongside ${state ?? "the"} ${jurisdiction} sources`
      : `${jurisdiction} jurisdiction with no explicit federal request -- federal legislative/regulatory/court sources excluded from the initial search`,
  };
}

// Keyword-triggered add-ons for topics that aren't full PoliticalIntents in
// their own right (promoting them would change response SHAPE elsewhere in
// the app -- these are routing hints only, scoped to this file).
const GRANTS_RE = /\bgrants?\b/i;
const HOUSING_RE = /\bhousing\b|\bHUD\b/i;
const ATTORNEY_GENERAL_RE = /\battorney general\b|\bA\.?G\.?\b's? office\b/i;

// Federal budget documents -- state/local budgets have no single reliable
// federal-style domain, so this only applies when jurisdiction is federal
// (see selectOfficialDomains).
const FEDERAL_BUDGET_ROUTE = route(["usaspending.gov", "congress.gov"], ["USAspending.gov", "Congress.gov"]);

// State-level official domains, keyed by the title-cased state name
// detectState() already returns (e.g. "Illinois"), one nested record per
// state instead of parallel Records -- makes it easy to see at a glance
// which categories are verified vs. omitted for a given state, and gives
// Fix 5's cross-state check (stateForDomain, below) one source to build its
// reverse lookup from instead of several.
//
// Coverage is intentionally partial within each state, not just across
// states: `legislature` and `agency` (the general executive portal) are
// populated for all 50 states -- these are the most stable, well-established
// public domains and were spot-verified via live search during
// implementation (Nebraska, New Hampshire, Virginia, Illinois AG, Georgia
// elections all confirmed exact). `courts`/`attorneyGeneral`/`elections` are
// populated only where independently verified with reasonable confidence;
// the remainder are deliberately left blank rather than guessed -- an
// unmapped category falls through to DEFAULT_OFFICIAL_DOMAINS (or whatever
// other categories ARE populated for that state), never to a wrong domain.
// A wrong entry here is now actively harmful (Fix 5's cross-state rejection
// can reject a correct source over it), so omission is the safe default;
// extend only with independently verified domains, never from memory alone.
// legislature may be a single domain or an array (a few states run their
// two chambers on genuinely separate domains with no unified site).
interface StateOfficialDomains {
  legislature?: string | string[];
  agency?: string;
  courts?: string;
  attorneyGeneral?: string;
  elections?: string;
}

// Exported for source-router.test.ts's duplicate-domain check only -- not
// meant as a general-purpose export; selectOfficialDomains/stateForDomain
// are the real public API.
export const STATE_OFFICIAL_DOMAINS: Record<string, StateOfficialDomains> = {
  Alabama: { legislature: "legislature.state.al.us", agency: "alabama.gov" },
  Alaska: { legislature: "akleg.gov", agency: "alaska.gov" },
  Arizona: { legislature: "azleg.gov", agency: "az.gov", courts: "azcourts.gov" },
  Arkansas: { legislature: "arkleg.state.ar.us", agency: "arkansas.gov" },
  California: {
    legislature: "leginfo.legislature.ca.gov",
    agency: "ca.gov",
    courts: "courts.ca.gov",
    attorneyGeneral: "oag.ca.gov",
  },
  Colorado: { legislature: "leg.colorado.gov", agency: "colorado.gov", courts: "courts.state.co.us" },
  Connecticut: { legislature: "cga.ct.gov", agency: "ct.gov" },
  Delaware: { legislature: "legis.delaware.gov", agency: "delaware.gov" },
  Florida: {
    legislature: "flsenate.gov",
    agency: "myflorida.com",
    courts: "flcourts.gov",
    attorneyGeneral: "myfloridalegal.com",
  },
  Georgia: { legislature: "legis.ga.gov", agency: "georgia.gov", elections: "sos.ga.gov" },
  Hawaii: { legislature: "capitol.hawaii.gov", agency: "hawaii.gov" },
  Idaho: { legislature: "legislature.idaho.gov", agency: "idaho.gov" },
  Illinois: {
    legislature: "ilga.gov",
    agency: "illinois.gov",
    courts: "illinoiscourts.gov",
    attorneyGeneral: "illinoisattorneygeneral.gov",
  },
  Indiana: { legislature: "iga.in.gov", agency: "in.gov", courts: "courts.in.gov" },
  Iowa: { legislature: "legis.iowa.gov", agency: "iowa.gov" },
  Kansas: { legislature: "kslegislature.gov", agency: "kansas.gov" },
  Kentucky: { legislature: "legislature.ky.gov", agency: "kentucky.gov" },
  Louisiana: { legislature: "legis.la.gov", agency: "louisiana.gov" },
  Maine: { legislature: "legislature.maine.gov", agency: "maine.gov" },
  Maryland: { legislature: "mgaleg.maryland.gov", agency: "maryland.gov", courts: "courts.state.md.us" },
  Massachusetts: { legislature: "malegislature.gov", agency: "mass.gov" },
  Michigan: { legislature: "legislature.mi.gov", agency: "michigan.gov", courts: "courts.michigan.gov" },
  Minnesota: { legislature: "leg.mn.gov", agency: "mn.gov", courts: "mncourts.gov" },
  Mississippi: { legislature: "legislature.ms.gov", agency: "mississippi.gov" },
  Missouri: { legislature: ["house.mo.gov", "senate.mo.gov"], agency: "mo.gov", courts: "courts.mo.gov" },
  Montana: { legislature: "leg.mt.gov", agency: "montana.gov" },
  Nebraska: { legislature: "nebraskalegislature.gov", agency: "nebraska.gov" },
  Nevada: { legislature: "leg.state.nv.us", agency: "nv.gov" },
  "New Hampshire": { legislature: "gencourt.state.nh.us", agency: "nh.gov" },
  "New Jersey": { legislature: "njleg.state.nj.us", agency: "nj.gov" },
  "New Mexico": { legislature: "nmlegis.gov", agency: "newmexico.gov" },
  "New York": { legislature: ["nysenate.gov", "nyassembly.gov"], agency: "ny.gov", courts: "nycourts.gov" },
  "North Carolina": { legislature: "ncleg.gov", agency: "nc.gov", courts: "nccourts.gov" },
  "North Dakota": { legislature: "legis.nd.gov", agency: "nd.gov" },
  Ohio: {
    legislature: "legislature.ohio.gov",
    agency: "ohio.gov",
    courts: "courts.ohio.gov",
    attorneyGeneral: "ohioattorneygeneral.gov",
  },
  Oklahoma: { legislature: "oklegislature.gov", agency: "oklahoma.gov" },
  Oregon: { legislature: "oregonlegislature.gov", agency: "oregon.gov" },
  Pennsylvania: { legislature: "legis.state.pa.us", agency: "pa.gov" },
  "Rhode Island": { legislature: "rilegislature.gov", agency: "ri.gov" },
  "South Carolina": { legislature: "scstatehouse.gov", agency: "sc.gov" },
  "South Dakota": { legislature: "sdlegislature.gov", agency: "sd.gov" },
  Tennessee: { legislature: "capitol.tn.gov", agency: "tn.gov", courts: "tncourts.gov" },
  Texas: {
    legislature: "capitol.texas.gov",
    agency: "texas.gov",
    courts: "txcourts.gov",
    attorneyGeneral: "texasattorneygeneral.gov",
  },
  Utah: { legislature: "le.utah.gov", agency: "utah.gov" },
  Vermont: { legislature: "legislature.vermont.gov", agency: "vermont.gov" },
  Virginia: { legislature: "virginiageneralassembly.gov", agency: "virginia.gov", attorneyGeneral: "oag.state.va.us" },
  Washington: { legislature: "leg.wa.gov", agency: "wa.gov", courts: "courts.wa.gov" },
  "West Virginia": { legislature: "wvlegislature.gov", agency: "wv.gov" },
  Wisconsin: { legislature: "legis.wisconsin.gov", agency: "wisconsin.gov", courts: "wicourts.gov" },
  Wyoming: { legislature: "wyoleg.gov", agency: "wyoming.gov" },
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

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function selectOfficialDomains(
  intents: Set<PoliticalIntent>,
  routing: JurisdictionRouting,
  questionText: string,
): OfficialSourceRoute {
  const { jurisdiction, state } = routing;
  const matched: OfficialSourceRoute[] = [];

  // Every federal-domain add below (topic-keyed routes, Grants.gov, HUD, the
  // federal budget route) is gated on the classifier's verdict, not
  // re-derived from raw intents here -- a state/local question with no
  // explicit federal ask must never pull in a federal domain no matter which
  // specific keyword/intent would otherwise have matched it.
  if (routing.includeFederalSources) {
    for (const [intent, topicRoute] of Object.entries(FEDERAL_TOPIC_DOMAINS)) {
      if (intents.has(intent as PoliticalIntent)) matched.push(topicRoute);
    }
    if (GRANTS_RE.test(questionText)) matched.push(route(["grants.gov"], ["Grants.gov"]));
    if (HOUSING_RE.test(questionText)) {
      matched.push(route(["hud.gov"], ["HUD"]));
    }
    if (jurisdiction === "federal" && intents.has("budget")) matched.push(FEDERAL_BUDGET_ROUTE);
  }

  if (jurisdiction !== "federal" && state) {
    const stateDomains = STATE_OFFICIAL_DOMAINS[state];
    if (stateDomains) {
      const legislature = asArray(stateDomains.legislature);
      if (legislature.length > 0) matched.push(route(legislature, [`${state} Legislature`]));
      if (stateDomains.agency) matched.push(route([stateDomains.agency], [`${state} state agencies`]));
      // Courts are included whenever the state itself is known, not gated
      // behind a courts-specific intent -- a legislative-history or bill-
      // reform question can legitimately need court-challenge context (the
      // civil-asset-forfeiture audit needed exactly this) without the
      // question ever carrying a "state_courts"/"supreme_court" intent.
      if (stateDomains.courts) matched.push(route([stateDomains.courts], [`${state} courts`]));
      if (stateDomains.attorneyGeneral && ATTORNEY_GENERAL_RE.test(questionText)) {
        matched.push(route([stateDomains.attorneyGeneral], [`${state} Attorney General`]));
      }
      if (stateDomains.elections && intents.has("elections")) {
        matched.push(route([stateDomains.elections], [`${state} elections`]));
      }
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

// Fix 5 (jurisdiction validation): a reverse lookup built once from
// STATE_OFFICIAL_DOMAINS, used to reject a fetched candidate whose domain is
// a KNOWN domain belonging to a DIFFERENT state than the one being
// researched (e.g. wvlegislature.gov surfacing for a Virginia query). Only
// ever returns a hit for a domain actually present in the table above --
// congress.gov, the bare gov/mil floor, and any unmapped state's domain all
// correctly return null, by construction, so this never produces a false
// cross-state rejection for a domain it simply doesn't recognize.
const DOMAIN_TO_STATE: Map<string, string> = new Map();
for (const [state, domains] of Object.entries(STATE_OFFICIAL_DOMAINS)) {
  const all = [
    ...asArray(domains.legislature),
    ...(domains.agency ? [domains.agency] : []),
    ...(domains.courts ? [domains.courts] : []),
    ...(domains.attorneyGeneral ? [domains.attorneyGeneral] : []),
    ...(domains.elections ? [domains.elections] : []),
  ];
  for (const domain of all) DOMAIN_TO_STATE.set(domain, state);
}

export function stateForDomain(host: string): string | null {
  return DOMAIN_TO_STATE.get(host) ?? null;
}

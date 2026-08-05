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

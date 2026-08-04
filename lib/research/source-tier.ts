// Source ranking. SourceTier stays the coarse 4-bucket type everywhere it's
// already used for counts/UI (government/news/reference/general), but the
// domain lists and sourceAuthorityRank below implement a much finer
// authority order for actual SORTING/citation preference within those
// buckets. Both sourceTier (used for Evidence Strength / confidence
// counting) and sourceAuthorityRank (used for display/citation order) take
// the source's title, not just its URL -- domain naming has no consistent
// pattern across the 50 states, so distinguishing e.g. a state legislature
// from a county government page has to be done from what the page actually
// says it is, not guessed from its hostname.
export type SourceTier = "government" | "news" | "reference" | "general";

const GOVERNMENT_DOMAINS = new Set([
  "who.int", "un.org", "imf.org", "worldbank.org", "federalreserve.gov", "congress.gov", "supremecourt.gov",
]);

// Tier: wire services -- the most consistently authoritative, least
// editorialized news sources, reported first and syndicated everywhere.
const WIRE_SERVICE_DOMAINS = new Set([
  "apnews.com", "reuters.com", "bloomberg.com", "ft.com", "bbc.com", "bbc.co.uk", "npr.org",
]);
// National newspapers/broadcasters.
const NATIONAL_NEWS_DOMAINS = new Set([
  "nytimes.com", "washingtonpost.com", "wsj.com", "usatoday.com", "politico.com", "axios.com",
  "thehill.com", "cbsnews.com", "nbcnews.com", "abcnews.go.com", "cnn.com", "foxnews.com", "pbs.org", "c-span.org",
]);
// Known local news outlets (extend as specific markets come up -- anything
// ending in common local-station patterns still falls through to the
// generic "news" bucket below via NEWS-shaped domain heuristics).
const LOCAL_NEWS_DOMAINS = new Set(["wrex.com", "wifr.com", "rockfordregisterstar.com"]);

const NEWS_DOMAINS = new Set([...WIRE_SERVICE_DOMAINS, ...NATIONAL_NEWS_DOMAINS, ...LOCAL_NEWS_DOMAINS]);

// Congressional Budget Office / Congressional Research Service / Government
// Accountability Office -- official, nonpartisan, and genuinely
// authoritative, but explicitly a SECONDARY tier here: they produce
// analysis and cost estimates ABOUT legislation, not the legislative record
// itself (bill text, status, votes, committee action). A CBO estimate must
// never replace or outrank the bill's own official record for what the
// bill actually says or where it stands procedurally -- it supplements
// that record with fiscal analysis. Still ranked above universities/legal
// analysis below, per the stated priority order (CRS/GAO/equivalent
// government reports before public universities).
const ANALYSIS_AGENCY_DOMAINS = new Set(["cbo.gov", "gao.gov", "crsreports.congress.gov", "everycrsreport.com"]);

// Academic/legal-analysis domains (secondary tier: universities, legal
// databases -- useful analysis, never a substitute for an official record).
const LEGAL_ANALYSIS_DOMAINS = new Set(["courtlistener.com"]);

// Ballotpedia and other nonprofit policy/reference organizations -- useful
// secondary context, never preferred over an official source that covers
// the same fact.
const BALLOTPEDIA_DOMAIN = "ballotpedia.org";
const REFERENCE_DOMAINS = new Set(["ballotpedia.org", "opensecrets.org", "votesmart.org"]);
// Wikipedia -- background/fallback only, never primary when anything above
// it exists.
const WIKIPEDIA_DOMAINS = new Set(["wikipedia.org"]);

const TIER_SORT_SCORE: Record<SourceTier, number> = { government: 4, news: 3, reference: 2, general: 1 };

function bareHostOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

export function isWikipedia(url: string): boolean {
  const bareHost = bareHostOf(url);
  return bareHost !== null && (bareHost === "wikipedia.org" || bareHost.endsWith(".wikipedia.org"));
}

// --- State/local government classification (title-based) -------------------
//
// Everything below distinguishes categories of official government source
// within the generic .gov/.mil/.us bucket, purely from what a page's own
// title says it is -- checked most-specific/highest-priority first, so an
// ambiguous title (e.g. one that could read as either a legislature page or
// a statutes page) resolves to whichever category this project's stated
// priority order ranks higher.
const STATE_LEGISLATURE_RE =
  /\b(state )?senate\b|\bhouse of representatives\b|\bgeneral assembly\b|\bstate legislature\b|\blegislature\b|\bbill status\b|\bbill history\b|\bbill tracking\b|\blegislative information\b/i;
const STATE_STATUTES_RE = /\bstatutes?\b|\brevised (statutes|code)\b|\bstate code\b|\bsession laws?\b|\badministrative code\b/i;
const GOVERNOR_RE = /\bgovernor'?s?( office)?\b/i;
// Matches both state supreme courts and the U.S. Supreme Court -- "supreme
// court" alone doesn't distinguish them, and it doesn't need to: both are
// court opinions, ranked the same relative to government agencies.
const STATE_COURTS_RE = /\bsupreme court\b|\bcourt of appeals\b|\bappellate court\b|\bstate court\w*\b/i;
const STATE_AGENCY_RE = /\bdepartment of\b|\bstate agency\b|\bdivision of\b|\bstate commission\b/i;
const COUNTY_GOV_RE = /\bcounty\b|\bparish of\b/i;
const MUNICIPAL_GOV_RE =
  /\bcity of\b|\btown of\b|\bvillage of\b|\btownship of\b|\bborough of\b|\bcity council\b|\bcity government\b|\bmunicipal\w*\b/i;

type GovCategory = "state_legislature" | "state_statutes" | "governor" | "state_courts" | "state_agency" | "county" | "municipal" | "unclassified";

// Checked in the project's stated priority order: the legislative record
// itself outranks statutes/code, which outranks the executive branch, which
// outranks courts and agencies, which outrank local government -- county
// before municipal, matching the requested list order.
function classifyGovSource(title: string): GovCategory {
  if (STATE_LEGISLATURE_RE.test(title)) return "state_legislature";
  if (STATE_STATUTES_RE.test(title)) return "state_statutes";
  if (GOVERNOR_RE.test(title)) return "governor";
  if (STATE_COURTS_RE.test(title)) return "state_courts";
  if (STATE_AGENCY_RE.test(title)) return "state_agency";
  if (COUNTY_GOV_RE.test(title)) return "county";
  if (MUNICIPAL_GOV_RE.test(title)) return "municipal";
  return "unclassified";
}

// A city/county page describing how it implements a state or federal law
// (e.g. a Fort Myers or Orange County page about Florida's Live Local Act)
// is legitimate supplementary content, but it is NOT a primary official
// legislative source -- Evidence Strength must not count it as an "Official
// Government Source" just because it happens to be hosted on .gov/.us.
function isLocalGovernmentSource(title: string): boolean {
  const category = classifyGovSource(title);
  return category === "county" || category === "municipal";
}

export function sourceTier(url: string, title = ""): SourceTier {
  const bareHost = bareHostOf(url);
  if (bareHost === null) return "general";

  if (GOVERNMENT_DOMAINS.has(bareHost)) return "government";
  if (NEWS_DOMAINS.has(bareHost)) return "news";
  if (REFERENCE_DOMAINS.has(bareHost)) return "reference";
  if (isWikipedia(url)) return "reference";
  if (bareHost.endsWith(".gov") || bareHost.endsWith(".mil") || bareHost.endsWith(".us")) {
    // Official government domain -- EXCEPT a county/municipal
    // implementation page, which does not count as a primary legislative
    // source no matter what TLD it happens to be hosted on. CBO/GAO/CRS
    // domains still count as "government" here (they genuinely are
    // official government sources); they're only demoted in
    // sourceAuthorityRank's CITATION PREFERENCE order below, not excluded
    // from this tier.
    return isLocalGovernmentSource(title) ? "general" : "government";
  }
  if (bareHost.endsWith(".edu")) return "reference";
  return "general";
}

export function sourceTierScore(url: string): number {
  return TIER_SORT_SCORE[sourceTier(url)];
}

// Finer-grained authority ranking than SourceTier -- reflects how a real
// policy researcher would actually trust these sources relative to each
// other, not just "government vs not." Used only for ordering/citation
// preference; confidence calculation elsewhere uses the coarser SourceTier.
// Checked most-specific-first.
//
// Federal priority order (exact, as specified): Congress.gov -> House.gov
// -> Senate.gov -> Federal Register -> govinfo.gov -> other government
// agencies -> court opinions. supremecourt.gov is deliberately NOT pinned
// here -- it falls through to the generic .gov categorization below (its
// title matches STATE_COURTS_RE's "supreme court" pattern, which is
// intentionally worded broadly enough to also catch the federal Supreme
// Court), landing below agency pages so that official government agencies
// outrank court opinions, per the requested source priority: (2) official
// government agencies before (3) official court opinions.
const AUTHORITY_RULES: [(host: string) => boolean, number][] = [
  [(h) => h === "congress.gov", 100],
  [(h) => h.endsWith(".house.gov") || h === "house.gov", 98],
  [(h) => h.endsWith(".senate.gov") || h === "senate.gov", 97],
  [(h) => h === "federalregister.gov", 95],
  [(h) => h === "govinfo.gov", 93],
];

// State-category rank bands, applied when a .gov/.mil/.us domain doesn't
// match one of the fixed federal domains above -- in the exact state
// priority order requested: legislature/bill-status -> statutes/code ->
// governor -> state agency -> state courts -> (separately, local
// government below all of these). Reused for federal pages that aren't one
// of the fixed AUTHORITY_RULES domains too (e.g. a federal agency's
// "Department of X" title matches the same state_agency pattern, and
// supremecourt.gov matches state_courts) -- which is what puts government
// agencies above court opinions at both levels, per the requested order.
// An unclassified official government page (no recognizable category in
// its title) sits between state agencies and local government -- still
// presumed a legitimate state/federal source, just not confidently
// categorized.
const GOV_CATEGORY_RANK: Record<GovCategory, number> = {
  state_legislature: 87,
  state_statutes: 85,
  governor: 83,
  state_agency: 81,
  state_courts: 79,
  unclassified: 75,
  county: 71,
  municipal: 69,
};

export function sourceAuthorityRank(url: string, title = ""): number {
  const bareHost = bareHostOf(url);
  if (bareHost === null) return 0;

  for (const [test, rank] of AUTHORITY_RULES) {
    if (test(bareHost)) return rank;
  }
  if (bareHost.endsWith(".gov") || bareHost.endsWith(".mil") || bareHost.endsWith(".us")) {
    // ".us" is included alongside ".gov"/".mil" since several states run
    // their official sites on a "state.XX.us" pattern rather than ".gov".
    return GOV_CATEGORY_RANK[classifyGovSource(title)];
  }
  // Secondary tier, in the requested order: CBO/CRS/GAO or equivalent
  // government reports -> public universities/legal analysis -> Ballotpedia
  // -> other nonprofit policy organizations -> news (only if necessary) ->
  // private websites -> Wikipedia last.
  if (ANALYSIS_AGENCY_DOMAINS.has(bareHost)) return 62; // CBO / CRS / GAO / equivalent government reports
  if (bareHost.endsWith(".edu") || LEGAL_ANALYSIS_DOMAINS.has(bareHost)) return 58; // public universities / legal analysis
  if (bareHost === BALLOTPEDIA_DOMAIN) return 54; // Ballotpedia
  if (REFERENCE_DOMAINS.has(bareHost)) return 52; // other nonprofit policy organizations
  if (WIRE_SERVICE_DOMAINS.has(bareHost)) return 45; // news -- only if necessary
  if (NATIONAL_NEWS_DOMAINS.has(bareHost)) return 40; // news -- only if necessary
  if (LOCAL_NEWS_DOMAINS.has(bareHost)) return 20; // local news
  if (isWikipedia(url)) return 5; // background only -- never outranks a real primary source
  return 10; // private websites / unclassified
}

// Shared de-duplication for any place multiple retrieval sets get merged
// (a gov-data provider and a web search both landing on the same page, or
// two comparison subjects citing the same source) -- keeps the first
// occurrence, so callers that push higher-confidence sources first (e.g.
// gov-data-provider results before web-search results) keep that one.
export function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export function sortByAuthority<T extends { url: string; title?: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => sourceAuthorityRank(b.url, b.title ?? "") - sourceAuthorityRank(a.url, a.title ?? ""),
  );
}

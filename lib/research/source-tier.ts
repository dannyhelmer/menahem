// Source ranking. SourceTier stays the coarse 4-bucket type everywhere it's
// already used for counts/UI (government/news/reference/general), but the
// domain lists and sourceAuthorityRank below implement a finer 6-tier
// authority order for actual SORTING within those buckets: (1) official
// government, (2) wire services (Reuters/AP/Bloomberg/FT/BBC/NPR), (3)
// national newspapers, (4) local news, (5) academic/think-tank, (6)
// Wikipedia -- ranked lowest, background-only, never the primary source
// when anything above it is available.
export type SourceTier = "government" | "news" | "reference" | "general";

const GOVERNMENT_DOMAINS = new Set([
  "who.int", "un.org", "imf.org", "worldbank.org", "federalreserve.gov", "congress.gov", "supremecourt.gov",
]);

// Tier 2: wire services -- the most consistently authoritative, least
// editorialized news sources, reported first and syndicated everywhere.
const WIRE_SERVICE_DOMAINS = new Set([
  "apnews.com", "reuters.com", "bloomberg.com", "ft.com", "bbc.com", "bbc.co.uk", "npr.org",
]);
// Tier 3: national newspapers/broadcasters.
const NATIONAL_NEWS_DOMAINS = new Set([
  "nytimes.com", "washingtonpost.com", "wsj.com", "usatoday.com", "politico.com", "axios.com",
  "thehill.com", "cbsnews.com", "nbcnews.com", "abcnews.go.com", "cnn.com", "foxnews.com", "pbs.org", "c-span.org",
]);
// Tier 4: known local news outlets (extend as specific markets come up --
// anything ending in common local-station patterns still falls through to
// the generic "news" bucket below via NEWS-shaped domain heuristics).
const LOCAL_NEWS_DOMAINS = new Set(["wrex.com", "wifr.com", "rockfordregisterstar.com"]);

const NEWS_DOMAINS = new Set([...WIRE_SERVICE_DOMAINS, ...NATIONAL_NEWS_DOMAINS, ...LOCAL_NEWS_DOMAINS]);

// Tier 5: academic/reference/think-tank.
const REFERENCE_DOMAINS = new Set(["ballotpedia.org", "opensecrets.org", "votesmart.org", "courtlistener.com"]);
// Tier 6: Wikipedia -- background/fallback only, never primary when
// anything above it exists.
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

export function sourceTier(url: string): SourceTier {
  const bareHost = bareHostOf(url);
  if (bareHost === null) return "general";

  if (GOVERNMENT_DOMAINS.has(bareHost)) return "government";
  if (NEWS_DOMAINS.has(bareHost)) return "news";
  if (REFERENCE_DOMAINS.has(bareHost)) return "reference";
  if (isWikipedia(url)) return "reference";
  if (bareHost.endsWith(".gov") || bareHost.endsWith(".mil") || bareHost.endsWith(".us")) return "government";
  if (bareHost.endsWith(".edu")) return "reference";
  return "general";
}

export function sourceTierScore(url: string): number {
  return TIER_SORT_SCORE[sourceTier(url)];
}

// Legal-database/analysis domains -- ranked with academic sources (below
// official government sources, above nonprofit policy orgs and all news).
const LEGAL_ANALYSIS_DOMAINS = new Set(["courtlistener.com"]);

// Within the generic government-domain bucket, distinguishes STATE-level
// official bodies (legislature, governor, state statutes/agencies) from
// LOCAL city/county implementation pages -- both are legitimate official
// government sources, but a city's page describing how it applies a state
// law (e.g. a Fort Myers or Orange County page about Florida's Live Local
// Act) is never a substitute for the state legislature's own record, and
// must rank below it even though both are technically ".gov". Matched
// against the source's title (not the URL, since municipal domain naming
// has no consistent pattern across jurisdictions) -- state hint checked
// first so a page titled e.g. "Florida Department of Revenue: County Tax
// Guidance" is correctly read as a state agency, not a county page.
const STATE_LEVEL_GOV_HINT_RE =
  /\b(state )?senate\b|\bhouse of representatives\b|\bstate legislature\b|\bgeneral assembly\b|\blegislature\b|\bstatutes?\b|\bgovernor'?s?( office)?\b|\brevised code\b|\badministrative code\b|\bdepartment of\b|\bstate agency\b/i;
const LOCAL_GOV_HINT_RE =
  /\bcity of\b|\btown of\b|\bvillage of\b|\btownship of\b|\bborough of\b|\bparish of\b|\bcity council\b|\bcounty commission\w*\b|\bcounty government\b|\bmunicipal\w*\b|\bcounty\b/i;

function isLocalImplementationSource(title: string): boolean {
  return LOCAL_GOV_HINT_RE.test(title) && !STATE_LEVEL_GOV_HINT_RE.test(title);
}

// Finer-grained authority ranking than SourceTier -- reflects how a real
// policy researcher would actually trust these sources relative to each
// other, not just "government vs not." Used only for ordering; confidence
// calculation elsewhere still uses the coarser SourceTier. Checked
// most-specific-first (crsreports.congress.gov before the general
// congress.gov suffix, etc.).
// Order follows the product's stated priority: official legislature
// websites -> official government agencies -> official bill text ->
// committee reports -> legislative fiscal notes -> government
// implementation reports -> academic/legal analysis -> reputable nonprofit
// policy organizations -> news (only if necessary) -> Wikipedia last. News
// is deliberately ranked BELOW academic and nonprofit-policy sources here --
// a wire service's summary of a bill is never preferred over the
// legislature's own record or a nonpartisan policy analysis of it.
const AUTHORITY_RULES: [(host: string) => boolean, number][] = [
  [(h) => h === "congress.gov", 100],
  [(h) => h === "crsreports.congress.gov", 98],
  [(h) => h === "federalregister.gov", 96],
  [(h) => h === "whitehouse.gov", 94],
  [(h) => h === "supremecourt.gov", 92],
  [(h) => h.endsWith(".house.gov") || h === "house.gov", 90],
  [(h) => h.endsWith(".senate.gov") || h === "senate.gov", 90],
  [(h) => h === "cbo.gov", 86], // legislative fiscal notes
  [(h) => h === "gao.gov", 85], // government implementation reports
];

export function sourceAuthorityRank(url: string, title = ""): number {
  const bareHost = bareHostOf(url);
  if (bareHost === null) return 0;

  for (const [test, rank] of AUTHORITY_RULES) {
    if (test(bareHost)) return rank;
  }
  // Any other official government domain (state legislature/governor/agency
  // sites, or a city/county implementation page) -- ".us" is included
  // alongside ".gov"/".mil" since several states run their official
  // legislative sites on a "state.XX.us" pattern rather than ".gov".
  if (bareHost.endsWith(".gov") || bareHost.endsWith(".mil") || bareHost.endsWith(".us")) {
    return isLocalImplementationSource(title) ? 68 : 80; // local implementation page vs. state/other official government
  }
  if (bareHost.endsWith(".edu") || LEGAL_ANALYSIS_DOMAINS.has(bareHost)) return 65; // academic/legal analysis
  if (REFERENCE_DOMAINS.has(bareHost)) return 55; // reputable nonprofit policy organizations
  if (WIRE_SERVICE_DOMAINS.has(bareHost)) return 45; // news -- only if necessary
  if (NATIONAL_NEWS_DOMAINS.has(bareHost)) return 40; // news -- only if necessary
  if (LOCAL_NEWS_DOMAINS.has(bareHost)) return 20; // local news
  if (isWikipedia(url)) return 5; // background only -- never outranks a real primary source
  return 10;
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

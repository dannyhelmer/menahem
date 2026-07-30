// Four-tier source ranking, ported from the Python app's tools/deep_research.py.
export type SourceTier = "government" | "news" | "reference" | "general";

const GOVERNMENT_DOMAINS = new Set([
  "who.int", "un.org", "imf.org", "worldbank.org", "federalreserve.gov", "congress.gov", "supremecourt.gov",
]);
const NEWS_DOMAINS = new Set([
  "apnews.com", "reuters.com", "npr.org", "pbs.org", "c-span.org", "nytimes.com", "washingtonpost.com",
  "wsj.com", "bloomberg.com", "politico.com", "axios.com", "thehill.com", "usatoday.com", "cbsnews.com",
  "nbcnews.com", "abcnews.go.com", "cnn.com", "foxnews.com",
]);
const REFERENCE_DOMAINS = new Set(["ballotpedia.org", "opensecrets.org", "votesmart.org", "courtlistener.com"]);

const TIER_SORT_SCORE: Record<SourceTier, number> = { government: 4, news: 3, reference: 2, general: 1 };

export function sourceTier(url: string): SourceTier {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "general";
  }
  const bareHost = host.startsWith("www.") ? host.slice(4) : host;

  if (GOVERNMENT_DOMAINS.has(bareHost)) return "government";
  if (NEWS_DOMAINS.has(bareHost)) return "news";
  if (REFERENCE_DOMAINS.has(bareHost)) return "reference";
  if (host.endsWith(".gov") || host.endsWith(".mil")) return "government";
  if (host.endsWith(".edu")) return "reference";
  return "general";
}

export function sourceTierScore(url: string): number {
  return TIER_SORT_SCORE[sourceTier(url)];
}

// Finer-grained authority ranking than SourceTier -- reflects how a real
// policy researcher would actually trust these sources relative to each
// other, not just "government vs not." Used only for ordering; confidence
// calculation elsewhere still uses the coarser SourceTier. Checked
// most-specific-first (crsreports.congress.gov before the general
// congress.gov suffix, etc.).
const AUTHORITY_RULES: [(host: string) => boolean, number][] = [
  [(h) => h === "congress.gov", 100],
  [(h) => h === "crsreports.congress.gov", 85],
  [(h) => h.endsWith(".house.gov") || h === "house.gov", 95],
  [(h) => h.endsWith(".senate.gov") || h === "senate.gov", 95],
  [(h) => h === "cbo.gov", 90],
  [(h) => h === "federalregister.gov", 80],
  [(h) => h === "supremecourt.gov", 75],
];

export function sourceAuthorityRank(url: string): number {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 0;
  }
  const bareHost = host.startsWith("www.") ? host.slice(4) : host;

  for (const [test, rank] of AUTHORITY_RULES) {
    if (test(bareHost)) return rank;
  }
  if (bareHost.endsWith(".gov") || bareHost.endsWith(".mil")) return 50; // other federal/state government
  if (REFERENCE_DOMAINS.has(bareHost) || bareHost.endsWith(".edu")) return 30;
  if (NEWS_DOMAINS.has(bareHost)) return 20;
  return 10;
}

export function sortByAuthority<T extends { url: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => sourceAuthorityRank(b.url) - sourceAuthorityRank(a.url));
}

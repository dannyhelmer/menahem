import { fetchPageText } from "./fetch";
import { getConfiguredProviders } from "./registry";
import type { SearchProvider, SearchResult } from "./types";
import { sourceAuthorityRank, sourceTier } from "@/lib/research/source-tier";

const MAX_PAGES_TO_FETCH = 8;
// Per-source fetches run in parallel (see below), so this bounds total
// search-phase wall-clock time regardless of how many candidates there are
// -- previously fetches ran sequentially (up to 8 x 8s = ~64s worst case),
// which alone could blow well past any reasonable response time before the
// model was ever even invoked. Kept under 12s (rather than the older 15s) so
// that runSearchWithRetry's initial-attempt-plus-retry can both complete
// inside the caller's own outer SEARCH_TIMEOUT_MS budget instead of the
// retry getting cut off mid-flight.
const SEARCH_PHASE_TIMEOUT_MS = 11_000;

const FRIENDLY_SOURCE_NAMES: Record<string, string> = {
  "reuters.com": "Reuters",
  "apnews.com": "Associated Press",
  "congress.gov": "Congress.gov",
  "whitehouse.gov": "White House",
  "supremecourt.gov": "Supreme Court",
  "federalregister.gov": "Federal Register",
  "bbc.com": "BBC",
  "bbc.co.uk": "BBC",
  "npr.org": "NPR",
  "usa.gov": "USA.gov",
  "ballotpedia.org": "Ballotpedia",
  "wikipedia.org": "Wikipedia",
};

// A short, human-friendly label for a source URL -- used for the live
// "Searching..." progress checklist, not for citations (which keep the
// real page title).
export function friendlySourceName(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (FRIENDLY_SOURCE_NAMES[host]) return FRIENDLY_SOURCE_NAMES[host];
    if (host.endsWith(".gov")) return host;
    const primary = host.split(".").slice(-2, -1)[0] ?? host;
    return primary.charAt(0).toUpperCase() + primary.slice(1);
  } catch {
    return url;
  }
}

const SOCIAL_MEDIA_DOMAINS = new Set([
  "facebook.com", "m.facebook.com", "twitter.com", "x.com", "instagram.com",
  "tiktok.com", "reddit.com", "threads.net", "linkedin.com",
]);

function isSocialMediaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return SOCIAL_MEDIA_DOMAINS.has(host);
  } catch {
    return false;
  }
}

export interface SearchSource {
  title: string;
  url: string;
}

export interface SearchOutcome {
  success: boolean;
  liveData?: string;
  sources?: SearchSource[];
  note?: string;
}

export interface SearchProgressUpdate {
  label: string;
}

export async function runSearchForMessage(
  query: string,
  maxResults = 5,
  options?: { preferRecent?: boolean; onProgress?: (update: SearchProgressUpdate) => void },
): Promise<SearchOutcome> {
  const onProgress = options?.onProgress ?? (() => {});
  console.log(`[orchestrate] raw search query: "${query}" (maxResults=${maxResults}, preferRecent=${Boolean(options?.preferRecent)})`);
  const providers = await getConfiguredProviders();
  if (providers.length === 0) {
    console.log("[orchestrate] no search provider configured");
    return {
      success: false,
      note:
        "Web search isn't available -- no web search provider is configured yet (Settings > Search Providers needs a Brave, Tavily, Google, or SerpAPI key).",
    };
  }

  let usedProvider: SearchProvider | null = null;
  let results: SearchResult[] = [];
  const failureNotes: string[] = [];

  const providerOptions = { preferRecent: options?.preferRecent };
  for (const provider of providers) {
    try {
      const providerResults = await provider.search(query, maxResults, providerOptions);
      if (providerResults.length > 0) {
        usedProvider = provider;
        results = providerResults;
        break;
      }
      failureNotes.push(`${provider.label} returned no results`);
    } catch (err) {
      console.error(`[orchestrate] provider "${provider.label}" threw:`, err);
      failureNotes.push(`${provider.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!usedProvider) {
    console.error(`[orchestrate] every provider failed/empty: ${failureNotes.join("; ")}`);
    return {
      success: false,
      note: `Web search failed across every configured provider (${providers.length} tried) -- ${failureNotes.join("; ")}.`,
    };
  }

  // A "prefer recent" search (Tavily's topic=news, Brave's freshness filter)
  // restricts to news-shaped content, which can starve a stable factual
  // lookup ("who is the current president") down to almost nothing -- an
  // official bio page or reference source isn't "news" and gets excluded
  // entirely, not just deprioritized. If recency mode returned too little,
  // fall back to a normal search and merge in whatever it adds.
  if (options?.preferRecent && results.length < 3) {
    console.log(`[orchestrate] preferRecent search only returned ${results.length} result(s) -- falling back to a general search too`);
    try {
      const generalResults = await usedProvider.search(query, maxResults);
      const seen = new Set(results.map((r) => r.url));
      for (const r of generalResults) {
        if (!seen.has(r.url)) {
          results.push(r);
          seen.add(r.url);
        }
      }
    } catch (err) {
      console.error(`[orchestrate] fallback general search failed:`, err);
    }
  }

  // Social-media posts are essentially never a citable source for a
  // government-research platform (no editorial process, easily spoofed,
  // often just someone reacting to the actual news) -- excluded entirely
  // rather than merely ranked low, so one doesn't consume a fetch slot
  // that a real secondary source could have used instead.
  const filtered = results.filter((r) => !isSocialMediaUrl(r.url));

  // Sort by source authority before deciding which pages are actually worth
  // fetching -- otherwise an official/authoritative source that happened to
  // rank lower in raw provider relevance never gets a chance at all once
  // the list is sliced down to MAX_PAGES_TO_FETCH.
  const ranked = filtered.sort((a, b) => sourceAuthorityRank(b.url, b.title) - sourceAuthorityRank(a.url, a.title));
  const candidates = ranked.slice(0, MAX_PAGES_TO_FETCH);

  onProgress({ label: "Searching trusted government and news sources..." });

  // Fetched in parallel, each with its own timeout inside fetchPageText, and
  // the whole batch additionally bounded by SEARCH_PHASE_TIMEOUT_MS -- a
  // single slow/hanging page can no longer stall every other fetch behind
  // it (previously sequential), and can't stall the response past a hard
  // ceiling even if something ignores its own timeout.
  const fetchWithProgress = async (candidate: SearchResult) => {
    const { text, error } = await fetchPageText(candidate.url);
    if (text) {
      onProgress({ label: `✓ ${friendlySourceName(candidate.url)}` });
      return { title: candidate.title, url: candidate.url, text };
    }
    console.log(`[orchestrate] couldn't extract page text for ${candidate.url}: ${error}`);
    return null;
  };

  const searchPhaseTimeout = new Promise<null>((resolve) =>
    setTimeout(() => {
      console.error(`[orchestrate] search phase exceeded ${SEARCH_PHASE_TIMEOUT_MS}ms -- proceeding with whatever fetched in time`);
      resolve(null);
    }, SEARCH_PHASE_TIMEOUT_MS),
  );

  const fetchResults = await Promise.race([
    Promise.allSettled(candidates.map(fetchWithProgress)),
    searchPhaseTimeout,
  ]);

  const fetched = (fetchResults ?? [])
    .filter((r): r is PromiseFulfilledResult<{ title: string; url: string; text: string } | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is { title: string; url: string; text: string } => v !== null);

  console.log(
    `[orchestrate] extracted ${fetched.length}/${candidates.length} documents via ${usedProvider.label}: ` +
      JSON.stringify(fetched.map((f) => ({ title: f.title, url: f.url, chars: f.text.length }))),
  );

  onProgress({ label: "Generating response..." });

  if (fetched.length > 0) {
    const lines = [
      `Live web search results (via ${usedProvider.label}, real page content fetched just now for this message). ` +
        "Use ONLY the content below -- do not invent additional sources, URLs, or facts, and cite sources by URL. " +
        "First: answer the user's EXACT question, directly, using whichever source(s) below actually address it -- " +
        "then stop, unless something else below is genuinely necessary to answer what was asked. A search for a " +
        "narrow factual question (\"who is the current president,\" \"when is the filing deadline\") will often " +
        "also retrieve unrelated content that merely mentions the same person or topic (breaking news, an " +
        "unrelated event, an old article) -- do NOT narrate that unrelated content just because it appeared in " +
        "the results below; a fact retrieved alongside the answer is not automatically part of the answer. If the " +
        "unrelated material seems like something the user might want, offer it as a one-line optional next step " +
        "instead of including it (\"I can also cover recent developments if you'd like\") -- never volunteer it " +
        "as part of the direct answer.\n\n" +
        "The exception: if the user's actual question IS broad or about current events in general (\"what's " +
        "happening with X,\" \"latest on Y\"), then read across ALL of the documents below and identify every " +
        "genuinely major, distinct development they collectively report -- leadership changes, candidate " +
        "announcements, election filings, endorsements, resignations, appointments, major legislation, court " +
        "rulings -- presenting each briefly (1-2 sentences) rather than only the single biggest story, then ask " +
        "if the user wants more detail on any specific item. Only do this when the question itself is genuinely " +
        "broad -- not for every search result set by default.",
    ];
    fetched.forEach((item, index) => {
      lines.push(`\n${index + 1}. ${item.title}\nURL: ${item.url}\n${item.text}`);
    });

    const unfetched = candidates.filter((c) => !fetched.some((f) => f.url === c.url));
    if (unfetched.length > 0) {
      lines.push("\n\nAdditional results (snippet only -- full page couldn't be retrieved):");
      for (const c of unfetched) lines.push(`- ${c.title} (${c.url}): ${c.snippet}`);
    }

    return {
      success: true,
      liveData: lines.join("\n"),
      sources: fetched.map((f) => ({ title: f.title, url: f.url })),
    };
  }

  if (candidates.length === 0) {
    console.error("[orchestrate] no candidates to fall back to after fetch phase");
    return {
      success: false,
      note: `Web search via ${usedProvider.label} returned results, but none could be retrieved in time.`,
    };
  }

  const lines = [
    `Live web search results (via ${usedProvider.label}) -- full page retrieval failed for all results, so only ` +
      "search-result snippets are available below. Use ONLY these -- do not invent additional sources, URLs, or " +
      "facts, and say plainly these are snippets, not full pages:",
  ];
  candidates.forEach((c, index) => {
    lines.push(`${index + 1}. ${c.title}\n   URL: ${c.url}\n   ${c.snippet}`);
  });

  return {
    success: true,
    liveData: lines.join("\n"),
    sources: candidates.map((c) => ({ title: c.title, url: c.url })),
  };
}

export interface SearchWithRetryOutcome extends SearchOutcome {
  // Whether a second, broadened attempt actually ran (the first pass found
  // it insufficient).
  retried: boolean;
  // True when even after retrying, no authoritative (government-tier) source
  // was found and corroboration is thin -- callers use this to tell the
  // model to state the limitation plainly and offer a general-knowledge
  // answer instead, rather than silently presenting weak evidence as if it
  // were sufficient.
  stillWeak: boolean;
}

// "Sufficient" for a research-grade answer means either a real official
// source turned up, or there's enough independent corroboration that the
// absence of one isn't immediately suspicious. sourceTier(url, title)
// excludes county/municipal implementation pages from the "government"
// bucket -- a search that only turned up a city page about a state law is
// correctly treated as insufficient here, so the automatic broadened retry
// actually fires instead of quietly settling for the local page.
function hasSufficientEvidence(sources: SearchSource[] | undefined): boolean {
  if (!sources || sources.length === 0) return false;
  return sources.some((s) => sourceTier(s.url, s.title) === "government") || sources.length >= 3;
}

// Strips parentheticals and quoted asides that can over-narrow a query
// (e.g. "H.R. 1 (One Big Beautiful Bill Act)" -> "H.R. 1"), then biases the
// phase-2 search toward primary/official sources instead of just repeating
// the same search verbatim.
function broadenQuery(query: string): string {
  const stripped = query
    .replace(/\([^)]*\)/g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const base = stripped.length > 0 ? stripped : query;
  return `${base} official source`;
}

// Biases phase 1 toward specific official government domains using the
// `site:` operator embedded directly in the query text -- provider-agnostic
// (works identically whether Tavily, Brave, Google, or SerpAPI is
// configured) without needing a per-provider "restrict domains" parameter
// that none of the four currently expose through this codebase's
// SearchOptions. `domains` comes from the caller's source router (see
// lib/search/source-router.ts) -- specific official sites for the topic/
// jurisdiction (e.g. "ilga.gov") when known, or the generic "gov"/"mil"
// floor otherwise.
function officialDomainQuery(query: string, domains: string[]): string {
  return `${query} ${domains.map((d) => `site:${d}`).join(" OR ")}`;
}

export interface PreferOfficial {
  domains: string[];
  labels: string[];
}

// The retrieval pipeline requested: for government-research queries, search
// official domains first, and only if that's insufficient, fall back to
// secondary sources -- never a single broad search ranked afterward. Phase 1
// restricts the search itself to the router's domains; only when that comes
// back insufficient does phase 2 run a genuinely unrestricted secondary
// search. Kept at exactly two phases (not three) so the total wall-clock
// time still fits inside the caller's outer SEARCH_TIMEOUT_MS budget, which
// was sized for two SEARCH_PHASE_TIMEOUT_MS phases.
//
// preferOfficial is opt-in, not the default: this function is also called
// for the generic catch-all "web search" path (weather, sports scores,
// general facts -- anything that didn't match a government/political
// intent upstream), where restricting phase 1 to official domains would
// just waste a search call on topics that were never going to have one.
// Callers that already know the query is government/legislative research
// (buildResearchPacket, gated on politicalIntents) pass the source router's
// result as preferOfficial.
export async function runSearchWithRetry(
  query: string,
  maxResults = 5,
  options?: { preferRecent?: boolean; preferOfficial?: PreferOfficial; onProgress?: (update: SearchProgressUpdate) => void },
): Promise<SearchWithRetryOutcome> {
  const firstQuery = options?.preferOfficial
    ? officialDomainQuery(query, options.preferOfficial.domains)
    : query;
  const first = await runSearchForMessage(firstQuery, maxResults, options);

  if (hasSufficientEvidence(first.sources)) {
    return { ...first, retried: false, stillWeak: false };
  }

  if (!options?.preferOfficial) {
    // Not a government-biased search -- fall back to the existing
    // broadened-retry behavior (phase 2 isn't "secondary sources" here,
    // it's just a less-narrow version of the same general search).
    console.log(
      `[orchestrate] initial retrieval insufficient for "${query.slice(0, 120)}" ` +
        `(${first.sources?.length ?? 0} source(s), no authoritative hit) -- broadening query and retrying`,
    );
    options?.onProgress?.({ label: "Initial results were limited -- broadening the search..." });
  } else {
    const labels = options.preferOfficial.labels.join(", ");
    console.log(
      `[orchestrate] official-domain search insufficient for "${query.slice(0, 120)}" ` +
        `(${first.sources?.length ?? 0} source(s), no authoritative hit from ${labels}) -- falling back to secondary sources`,
    );
    options?.onProgress?.({ label: `No sufficient results from ${labels} -- searching secondary sources...` });
  }

  const broadenedQuery = broadenQuery(query);
  // When phase 1 wasn't official-biased and there's nothing for broadenQuery
  // to strip, the phase-2 query would be identical to phase 1's -- reuse the
  // result instead of paying for a duplicate provider call that would just
  // return the same thing again.
  const retry =
    !options?.preferOfficial && broadenedQuery.toLowerCase() === firstQuery.toLowerCase()
      ? first
      : await runSearchForMessage(broadenedQuery, Math.max(maxResults, 8), options);

  // preferOfficial: phase-1 (official) sources are listed first -- they're
  // the preferred citations per the requested source priority. Otherwise
  // (generic broadened retry): the broadened retry is listed first, as
  // before -- it's presumed to have found more/better results than the
  // narrower first attempt. Either way, dedup-by-url keeps the first
  // occurrence, so the higher-priority list wins on overlap.
  const seen = new Set<string>();
  const mergedSources: SearchSource[] = [];
  const orderedSources = options?.preferOfficial
    ? [...(first.sources ?? []), ...(retry.sources ?? [])]
    : [...(retry.sources ?? []), ...(first.sources ?? [])];
  for (const s of orderedSources) {
    if (!seen.has(s.url)) {
      mergedSources.push(s);
      seen.add(s.url);
    }
  }

  const stillWeak = !hasSufficientEvidence(mergedSources);
  console.log(
    `[orchestrate] after retry: ${mergedSources.length} source(s) total, stillWeak=${stillWeak}`,
  );

  const liveDataParts = [first.liveData, retry !== first ? retry.liveData : undefined].filter(
    (d): d is string => Boolean(d),
  );

  return {
    success: retry.success || first.success,
    liveData: liveDataParts.length > 0 ? liveDataParts.join("\n\n---\n\n") : undefined,
    sources: mergedSources.length > 0 ? mergedSources : undefined,
    note: [first.note, retry !== first ? retry.note : undefined].filter(Boolean).join(" ") || undefined,
    retried: retry !== first,
    stillWeak,
  };
}

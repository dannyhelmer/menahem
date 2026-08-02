import { fetchPageText } from "./fetch";
import { getConfiguredProviders } from "./registry";
import type { SearchProvider, SearchResult } from "./types";
import { sourceAuthorityRank } from "@/lib/research/source-tier";

const MAX_PAGES_TO_FETCH = 8;

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

export async function runSearchForMessage(
  query: string,
  maxResults = 5,
  options?: { preferRecent?: boolean },
): Promise<SearchOutcome> {
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

  for (const provider of providers) {
    try {
      const providerResults = await provider.search(query, maxResults, options);
      if (providerResults.length > 0) {
        usedProvider = provider;
        results = providerResults;
        break;
      }
      failureNotes.push(`${provider.label} returned no results`);
    } catch (err) {
      failureNotes.push(`${provider.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!usedProvider) {
    console.log(`[orchestrate] every provider failed/empty: ${failureNotes.join("; ")}`);
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
      console.log(`[orchestrate] fallback general search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Sort by source authority before deciding which pages are actually worth
  // fetching -- otherwise an official/authoritative source that happened to
  // rank lower in raw provider relevance never gets a chance at all once
  // the list is sliced down to MAX_PAGES_TO_FETCH.
  const ranked = [...results].sort((a, b) => sourceAuthorityRank(b.url) - sourceAuthorityRank(a.url));
  const candidates = ranked.slice(0, MAX_PAGES_TO_FETCH);
  const fetched: { title: string; url: string; text: string }[] = [];
  for (const candidate of candidates) {
    const { text, error } = await fetchPageText(candidate.url);
    if (text) {
      fetched.push({ title: candidate.title, url: candidate.url, text });
    } else {
      console.log(`[orchestrate] couldn't extract page text for ${candidate.url}: ${error}`);
    }
  }
  console.log(
    `[orchestrate] extracted ${fetched.length}/${candidates.length} documents via ${usedProvider.label}: ` +
      JSON.stringify(fetched.map((f) => ({ title: f.title, url: f.url, chars: f.text.length }))),
  );

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

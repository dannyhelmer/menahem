import { fetchPageText } from "./fetch";
import { getConfiguredProviders } from "./registry";
import type { SearchProvider, SearchResult } from "./types";

const MAX_PAGES_TO_FETCH = 4;

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

export async function runSearchForMessage(query: string, maxResults = 5): Promise<SearchOutcome> {
  const providers = await getConfiguredProviders();
  if (providers.length === 0) {
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
      const providerResults = await provider.search(query, maxResults);
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
    return {
      success: false,
      note: `Web search failed across every configured provider (${providers.length} tried) -- ${failureNotes.join("; ")}.`,
    };
  }

  const candidates = results.slice(0, MAX_PAGES_TO_FETCH);
  const fetched: { title: string; url: string; text: string }[] = [];
  for (const candidate of candidates) {
    const { text } = await fetchPageText(candidate.url);
    if (text) fetched.push({ title: candidate.title, url: candidate.url, text });
  }

  if (fetched.length > 0) {
    const lines = [
      `Live web search results (via ${usedProvider.label}, real page content fetched just now for this message). ` +
        "Use ONLY the content below -- do not invent additional sources, URLs, or facts. Summarize/answer from " +
        "this content and cite sources by URL:",
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

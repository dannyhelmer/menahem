import { fetchPageText } from "./fetch";
import { getConfiguredProviders } from "./registry";
import type { SearchProvider, SearchResult } from "./types";

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

  const candidates = results.slice(0, MAX_PAGES_TO_FETCH);
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
        "Use ONLY the content below -- do not invent additional sources, URLs, or facts. Summarize/answer from " +
        "this content and cite sources by URL. " +
        "Do not just summarize the single top-ranked result -- read across ALL of the documents below and " +
        "identify every genuinely major, distinct development they collectively report, not only the first " +
        "article's angle. For a current-events or political question specifically, actively look for: " +
        "leadership changes, candidate announcements, election filings, endorsements, resignations, " +
        "appointments, major legislation, and court rulings. If multiple significant, distinct developments " +
        "appear across the sources, present each one briefly (roughly 1-2 sentences apiece) rather than giving " +
        "exhaustive depth on only the single biggest story -- prioritize covering every major development over " +
        "dwelling on one. After that brief rundown, ask the user if they'd like more detail on any specific " +
        "item, then list sources -- don't front-load a wall of detail nobody asked for yet.",
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

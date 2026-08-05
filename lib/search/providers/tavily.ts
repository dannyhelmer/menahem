import { getApiKey, isApiKeyConfigured } from "@/lib/settings/api-keys";
import { cleanProviderError } from "../clean-error";
import type { SearchOptions, SearchProvider, SearchResult } from "../types";

interface TavilyResponse {
  results?: { title: string; url: string; content: string; published_date?: string }[];
}

export const tavilyProvider: SearchProvider = {
  id: "tavily",
  label: "Tavily",

  async isConfigured() {
    return isApiKeyConfigured("tavily");
  },

  async search(query, maxResults = 5, options?: SearchOptions): Promise<SearchResult[]> {
    const apiKey = await getApiKey("tavily");
    if (!apiKey) throw cleanProviderError("Tavily");

    // Tavily's "news" topic sorts and filters by publish recency natively --
    // far more reliable than trying to infer freshness from snippet text
    // ourselves. `days` bounds it to the last week for a current-events ask.
    const body: Record<string, unknown> = { api_key: apiKey, query, max_results: maxResults };
    if (options?.preferRecent) {
      body.topic = "news";
      body.days = 7;
    }
    // Tavily's real, documented domain-restriction parameter -- audit
    // finding: a `site:x OR site:y` clause embedded in the free-text query
    // (the previous approach, still used for providers without this param)
    // is not reliably honored by Tavily's semantic/AI search, unlike a
    // classic keyword index. include_domains is an actual hard filter on
    // Tavily's side, so this is the real fix rather than hoping the query
    // text gets parsed as a boolean site restriction.
    if (options?.includeDomains && options.includeDomains.length > 0) {
      body.include_domains = options.includeDomains;
    }

    console.log(
      `[tavily] search request: query="${query}" maxResults=${maxResults} preferRecent=${Boolean(options?.preferRecent)} ` +
        `includeDomains=${JSON.stringify(options?.includeDomains ?? [])}`,
    );
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw cleanProviderError("Tavily", response.status);

    const data = (await response.json()) as TavilyResponse;
    console.log(`[tavily] raw response: ${(data.results ?? []).length} results -- ${JSON.stringify(data.results?.map((r) => ({ title: r.title, url: r.url, published: r.published_date })))}`);
    return (data.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));
  },
};

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

    console.log(`[tavily] search request: query="${query}" maxResults=${maxResults} preferRecent=${Boolean(options?.preferRecent)}`);
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

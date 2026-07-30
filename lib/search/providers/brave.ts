import { getApiKey, isApiKeyConfigured } from "@/lib/settings/api-keys";
import { cleanProviderError } from "../clean-error";
import type { SearchOptions, SearchProvider, SearchResult } from "../types";

interface BraveResponse {
  web?: { results?: { title: string; url: string; description: string; age?: string }[] };
}

export const braveProvider: SearchProvider = {
  id: "brave",
  label: "Brave Search",

  async isConfigured() {
    return isApiKeyConfigured("brave");
  },

  async search(query, maxResults = 5, options?: SearchOptions): Promise<SearchResult[]> {
    const apiKey = await getApiKey("brave");
    if (!apiKey) throw cleanProviderError("Brave Search");

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(maxResults));
    // Brave's native recency filter (past day/week/month) -- much more
    // reliable than sorting by whatever date text a page's snippet happens
    // to mention.
    if (options?.preferRecent) url.searchParams.set("freshness", "pw");

    console.log(`[brave] search request: query="${query}" maxResults=${maxResults} preferRecent=${Boolean(options?.preferRecent)}`);
    const response = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw cleanProviderError("Brave Search", response.status);

    const data = (await response.json()) as BraveResponse;
    console.log(`[brave] raw response: ${(data.web?.results ?? []).length} results -- ${JSON.stringify(data.web?.results?.map((r) => ({ title: r.title, url: r.url, age: r.age })))}`);
    return (data.web?.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
  },
};

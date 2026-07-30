import { getApiKey, isApiKeyConfigured } from "@/lib/settings/api-keys";
import { cleanProviderError } from "../clean-error";
import type { SearchProvider, SearchResult } from "../types";

interface TavilyResponse {
  results?: { title: string; url: string; content: string }[];
}

export const tavilyProvider: SearchProvider = {
  id: "tavily",
  label: "Tavily",

  async isConfigured() {
    return isApiKeyConfigured("tavily");
  },

  async search(query, maxResults = 5): Promise<SearchResult[]> {
    const apiKey = await getApiKey("tavily");
    if (!apiKey) throw cleanProviderError("Tavily");

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw cleanProviderError("Tavily", response.status);

    const data = (await response.json()) as TavilyResponse;
    return (data.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));
  },
};

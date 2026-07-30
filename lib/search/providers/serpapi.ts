import { getApiKey, isApiKeyConfigured } from "@/lib/settings/api-keys";
import { cleanProviderError } from "../clean-error";
import type { SearchProvider, SearchResult } from "../types";

interface SerpApiResponse {
  organic_results?: { title: string; link: string; snippet: string }[];
}

export const serpApiProvider: SearchProvider = {
  id: "serpapi",
  label: "SerpAPI",

  async isConfigured() {
    return isApiKeyConfigured("serpapi");
  },

  async search(query, maxResults = 5): Promise<SearchResult[]> {
    const apiKey = await getApiKey("serpapi");
    if (!apiKey) throw cleanProviderError("SerpAPI");

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("q", query);
    url.searchParams.set("engine", "google");

    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw cleanProviderError("SerpAPI", response.status);

    const data = (await response.json()) as SerpApiResponse;
    return (data.organic_results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    }));
  },
};

import { getApiKey, isApiKeyConfigured } from "@/lib/settings/api-keys";
import { cleanProviderError } from "../clean-error";
import type { SearchProvider, SearchResult } from "../types";

interface GoogleResponse {
  items?: { title: string; link: string; snippet: string }[];
}

export const googleProvider: SearchProvider = {
  id: "google",
  label: "Google Custom Search",

  async isConfigured() {
    const [key, cx] = await Promise.all([isApiKeyConfigured("google"), isApiKeyConfigured("google_cx")]);
    return key && cx;
  },

  async search(query, maxResults = 5): Promise<SearchResult[]> {
    const [apiKey, cx] = await Promise.all([getApiKey("google"), getApiKey("google_cx")]);
    if (!apiKey || !cx) throw cleanProviderError("Google Custom Search");

    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", cx);
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(Math.min(maxResults, 10)));

    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw cleanProviderError("Google Custom Search", response.status);

    const data = (await response.json()) as GoogleResponse;
    return (data.items ?? []).slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    }));
  },
};

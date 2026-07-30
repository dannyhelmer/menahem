import { getApiKey, isApiKeyConfigured } from "@/lib/settings/api-keys";
import { cleanProviderError } from "../clean-error";
import type { SearchProvider, SearchResult } from "../types";

interface BraveResponse {
  web?: { results?: { title: string; url: string; description: string }[] };
}

export const braveProvider: SearchProvider = {
  id: "brave",
  label: "Brave Search",

  async isConfigured() {
    return isApiKeyConfigured("brave");
  },

  async search(query, maxResults = 5): Promise<SearchResult[]> {
    const apiKey = await getApiKey("brave");
    if (!apiKey) throw cleanProviderError("Brave Search");

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(maxResults));

    const response = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw cleanProviderError("Brave Search", response.status);

    const data = (await response.json()) as BraveResponse;
    return (data.web?.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
  },
};

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  // When true, the caller has already detected a recency/current-events
  // need -- providers that support a native "recent news" mode (e.g.
  // Tavily's topic=news) should prefer that over generic relevance search.
  preferRecent?: boolean;
}

export interface SearchProvider {
  id: string;
  label: string;
  isConfigured(): Promise<boolean>;
  search(query: string, maxResults?: number, options?: SearchOptions): Promise<SearchResult[]>;
}

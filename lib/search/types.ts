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
  // Specific domains the search should be restricted to, when the caller
  // already knows the right official sites for this query (see
  // lib/search/source-router.ts). Providers with a real structured
  // domain-restriction parameter (Tavily's include_domains) should use it
  // directly rather than relying on the `site:` operator embedded in the
  // query text -- audit finding: Tavily's query field is AI/semantic, not a
  // classic keyword index, so there's no guarantee a `site:x OR site:y`
  // clause in free text is actually honored as a hard filter. Providers
  // without an equivalent parameter (Brave, Google CSE) can ignore this and
  // keep relying on the query-text site: operator, which their real
  // crawled-web indexes do reliably support.
  includeDomains?: string[];
}

export interface SearchProvider {
  id: string;
  label: string;
  isConfigured(): Promise<boolean>;
  search(query: string, maxResults?: number, options?: SearchOptions): Promise<SearchResult[]>;
}

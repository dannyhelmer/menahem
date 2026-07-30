export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  id: string;
  label: string;
  isConfigured(): Promise<boolean>;
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}

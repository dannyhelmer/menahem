export interface ApiKeyProviderDef {
  id: string;
  label: string;
  envVar?: string;
}

// Later phases each append one entry here (e.g. Congress.gov/FEC in the
// political-intelligence phase) -- adding a new keyed provider is meant to
// be exactly one entry, never new plumbing.
export const API_KEY_PROVIDERS: ApiKeyProviderDef[] = [
  { id: "brave", label: "Brave Search", envVar: "BRAVE_SEARCH_API_KEY" },
  { id: "tavily", label: "Tavily", envVar: "TAVILY_API_KEY" },
  { id: "google", label: "Google Custom Search API Key", envVar: "GOOGLE_SEARCH_API_KEY" },
  { id: "google_cx", label: "Google Search Engine ID", envVar: "GOOGLE_SEARCH_ENGINE_ID" },
  { id: "serpapi", label: "SerpAPI", envVar: "SERPAPI_API_KEY" },
  { id: "congress", label: "Congress.gov", envVar: "CONGRESS_API_KEY" },
  { id: "fec", label: "OpenFEC", envVar: "FEC_API_KEY" },
];

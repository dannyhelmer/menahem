import { braveProvider } from "./providers/brave";
import { googleProvider } from "./providers/google";
import { serpApiProvider } from "./providers/serpapi";
import { tavilyProvider } from "./providers/tavily";
import type { SearchProvider } from "./types";

// Fixed priority order. Tavily first, then Brave/Google/SerpAPI as fallback
// -- Tavily is the primary configured provider; for an official-domain
// search specifically, runSearchForMessage doesn't just stop at the first
// provider that returns SOME results, it keeps trying providers in this
// order until one actually returns a hit on a requested official domain
// (see the official-domain fallback loop there), only falling back to the
// best non-official result set if none of them do.
export const PROVIDER_PRIORITY: SearchProvider[] = [
  tavilyProvider,
  braveProvider,
  googleProvider,
  serpApiProvider,
];

export async function getConfiguredProviders(): Promise<SearchProvider[]> {
  const flags = await Promise.all(PROVIDER_PRIORITY.map((p) => p.isConfigured()));
  return PROVIDER_PRIORITY.filter((_, i) => flags[i]);
}

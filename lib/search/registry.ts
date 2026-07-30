import { braveProvider } from "./providers/brave";
import { googleProvider } from "./providers/google";
import { serpApiProvider } from "./providers/serpapi";
import { tavilyProvider } from "./providers/tavily";
import type { SearchProvider } from "./types";

// Fixed priority order -- no "preferred provider" picker yet (see plan's
// scope trim); this is exactly what the Python app falls back to anyway
// once nothing is explicitly preferred.
export const PROVIDER_PRIORITY: SearchProvider[] = [
  braveProvider,
  tavilyProvider,
  googleProvider,
  serpApiProvider,
];

export async function getConfiguredProviders(): Promise<SearchProvider[]> {
  const flags = await Promise.all(PROVIDER_PRIORITY.map((p) => p.isConfigured()));
  return PROVIDER_PRIORITY.filter((_, i) => flags[i]);
}

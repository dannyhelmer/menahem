import { isApiKeyConfigured } from "@/lib/settings/api-keys";
import ProviderStatusRow from "./ProviderStatusRow";

const SEARCH_PROVIDERS = [
  { id: "brave", label: "Brave Search" },
  { id: "tavily", label: "Tavily" },
  { id: "google", label: "Google Custom Search" },
  { id: "serpapi", label: "SerpAPI" },
];

// Read-only -- search provider credentials are deployment-level
// configuration (server env vars), not something an individual user sets
// up. Web Search works automatically for every signed-in user once the
// Menahem team has configured at least one of these.
export default async function SearchProvidersSection() {
  const statuses = await Promise.all(SEARCH_PROVIDERS.map((p) => isApiKeyConfigured(p.id)));

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Web Search uses whichever provider Menahem is configured with -- there's nothing for you to set up.
      </p>
      {SEARCH_PROVIDERS.map((p, i) => (
        <ProviderStatusRow key={p.id} label={p.label} configured={statuses[i]} />
      ))}
    </div>
  );
}

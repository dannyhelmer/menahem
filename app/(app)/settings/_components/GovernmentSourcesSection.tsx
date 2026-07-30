import { isApiKeyConfigured } from "@/lib/settings/api-keys";
import ProviderStatusRow from "./ProviderStatusRow";

const GOV_PROVIDERS = [
  { id: "congress", label: "Congress.gov" },
  { id: "fec", label: "OpenFEC" },
];

const PLANNED_PROVIDER_LABELS = [
  "Federal Register", "OpenSecrets", "State Legislature APIs", "Court Opinion Providers",
  "Ballotpedia", "GovInfo", "Census Bureau", "Congressional Budget Office",
  "State Constitutions", "Election APIs",
];

// Read-only -- these power Menahem's political research pipeline (official
// bill text, sponsors, campaign finance records) and are configured once
// for the whole deployment, not per user.
export default async function GovernmentSourcesSection() {
  const statuses = await Promise.all(GOV_PROVIDERS.map((p) => isApiKeyConfigured(p.id)));

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        These power Menahem&apos;s political research pipeline -- official bill text, sponsors, and campaign
        finance records instead of just general web search. Nothing for you to set up here either.
      </p>
      {GOV_PROVIDERS.map((p, i) => (
        <ProviderStatusRow key={p.id} label={p.label} configured={statuses[i]} />
      ))}
      <div className="pt-2">
        <p className="mb-2 text-xs font-medium tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
          Coming later
        </p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">{PLANNED_PROVIDER_LABELS.join(" · ")}</p>
      </div>
    </div>
  );
}

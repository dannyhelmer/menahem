import { getConfiguredAiProviders } from "@/lib/ai/get-provider";
import ProviderStatusRow from "./ProviderStatusRow";

// Read-only -- AI provider credentials are configured once for the whole
// deployment via server environment variables, not per user. Signing in is
// all that's required to start using Menahem.
export default function AiProviderStatusSection() {
  const providers = getConfiguredAiProviders();

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Menahem's AI provider is configured for everyone by the Menahem team -- there's nothing for you to set up.
      </p>
      {providers.map((p) => (
        <ProviderStatusRow key={p.id} label={p.label} configured={p.configured} />
      ))}
    </div>
  );
}

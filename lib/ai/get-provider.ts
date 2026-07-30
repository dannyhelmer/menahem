import { isProductionDeployment } from "@/lib/env";
import type { AIProvider } from "./provider";
import { ollamaProvider } from "./ollama-provider";
import { PROVIDER_ENV_VARS, PROVIDER_PRIORITY, PROVIDER_REGISTRY } from "./providers/registry";

const unconfiguredProvider: AIProvider = {
  name: "cloud",
  description: "no cloud AI provider configured",
  async isConfigured() {
    return false;
  },
  async streamChat() {
    throw new Error("No cloud AI provider is configured for this deployment.");
  },
};

// AI provider credentials are server-side deployment config now (Vercel env
// vars), never per-user -- every signed-in user shares the same configured
// provider, exactly like ChatGPT or Perplexity. There is deliberately no
// per-user key storage/lookup here anymore; `userId` is kept as a parameter
// only because several callers still pass one through for unrelated reasons
// (logging, owner-profile lookups elsewhere in the same request), not
// because it affects which provider gets used.
export async function getProvider(userId?: string): Promise<AIProvider> {
  if (!isProductionDeployment()) {
    console.log("[getProvider] non-production environment -> Ollama");
    return ollamaProvider;
  }

  for (const providerId of PROVIDER_PRIORITY) {
    const envVar = PROVIDER_ENV_VARS[providerId];
    const apiKey = process.env[envVar];
    if (apiKey && apiKey.trim()) {
      console.log(`[getProvider] using "${providerId}" (from ${envVar})`);
      return PROVIDER_REGISTRY[providerId](apiKey.trim());
    }
  }

  console.warn(
    `[getProvider] no AI provider configured -- set one of [${PROVIDER_PRIORITY.map((p) => PROVIDER_ENV_VARS[p]).join(", ")}] in the deployment environment.` +
      (userId ? ` (requested by user ${userId})` : ""),
  );
  return unconfiguredProvider;
}

// Used by chat-surface pages to decide whether to show the "AI isn't
// configured yet" screen instead of the composer. Now reflects whether the
// SERVER has a provider configured at all -- identical for every user,
// never gated per-account.
export async function needsApiKeySetup(): Promise<boolean> {
  const provider = await getProvider();
  return !(await provider.isConfigured());
}

// For the read-only Settings status display -- which AI providers the
// server currently has a credential for, in priority order. Never exposes
// the credential itself.
export function getConfiguredAiProviders(): { id: string; label: string; configured: boolean }[] {
  const LABELS: Record<string, string> = { openai: "OpenAI", anthropic: "Claude (Anthropic)" };
  return PROVIDER_PRIORITY.map((id) => ({
    id,
    label: LABELS[id] ?? id,
    configured: Boolean(process.env[PROVIDER_ENV_VARS[id]]?.trim()),
  }));
}

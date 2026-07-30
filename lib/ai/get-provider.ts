import type { AIProvider } from "./provider";
import { ollamaProvider } from "./ollama-provider";
import { PROVIDER_PRIORITY, PROVIDER_REGISTRY } from "./providers/registry";
import { getDecryptedUserApiKey } from "./user-api-keys";

// Ollama only exists on the developer's own machine -- it must never be
// reached from a deployed instance. Vercel sets VERCEL=1 on every
// deployment; NODE_ENV=production covers any other production build.
function isProductionDeployment(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

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

// Which provider a request should use is per-user in production (each
// account brings their own key) but global in dev (Ollama, no account
// needed). Async because production requires a DB round-trip to load and
// decrypt the calling user's key. Checks PROVIDER_PRIORITY in order and
// uses the first one the user has actually saved a key for.
export async function getProvider(userId?: string): Promise<AIProvider> {
  if (!isProductionDeployment()) {
    console.log("[getProvider] non-production environment -> Ollama");
    return ollamaProvider;
  }
  if (!userId) {
    console.warn("[getProvider] called with no userId in production -> unconfigured");
    return unconfiguredProvider;
  }

  for (const providerId of PROVIDER_PRIORITY) {
    console.log(`[getProvider] user ${userId}: checking for a saved "${providerId}" key`);
    let apiKey: string | null;
    try {
      apiKey = await getDecryptedUserApiKey(userId, providerId);
    } catch (error) {
      console.error(`[getProvider] user ${userId}: failed to load/decrypt "${providerId}" key:`, error);
      throw new Error(
        `Could not read your ${providerId} API key (it may have been saved under a different encryption ` +
          "key than this deployment currently has). Try clearing it and pasting it again in Settings.",
      );
    }

    if (apiKey) {
      console.log(`[getProvider] user ${userId}: using "${providerId}"`);
      return PROVIDER_REGISTRY[providerId](apiKey);
    }
  }

  console.log(`[getProvider] user ${userId}: no provider key configured for any of [${PROVIDER_PRIORITY.join(", ")}]`);
  return unconfiguredProvider;
}

// Used by chat-surface pages to decide whether to show the "add an API
// key" onboarding screen instead of the composer. Always false in dev
// (Ollama needs no per-user setup).
export async function needsApiKeySetup(userId: string): Promise<boolean> {
  const provider = await getProvider(userId);
  return !(await provider.isConfigured());
}

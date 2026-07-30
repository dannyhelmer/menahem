import type { AIProvider } from "./provider";
import { ollamaProvider } from "./ollama-provider";
import { PROVIDER_REGISTRY } from "./providers/registry";
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
// decrypt the calling user's key.
export async function getProvider(userId?: string): Promise<AIProvider> {
  if (!isProductionDeployment()) return ollamaProvider;
  if (!userId) return unconfiguredProvider;

  const apiKey = await getDecryptedUserApiKey(userId, "openai");
  if (!apiKey) return unconfiguredProvider;

  return PROVIDER_REGISTRY.openai(apiKey);
}

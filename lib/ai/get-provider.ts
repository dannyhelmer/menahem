import type { AIProvider } from "./provider";
import { cloudProvider } from "./cloud-provider";
import { ollamaProvider } from "./ollama-provider";

// Ollama only exists on the developer's own machine -- it must never be
// reached from a deployed instance. Vercel sets VERCEL=1 on every
// deployment; NODE_ENV=production covers any other production build.
// Production always uses the configured cloud provider instead, even if
// it turns out not to be configured (isConfigured() then reports that).
function isProductionDeployment(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export function getProvider(): AIProvider {
  return isProductionDeployment() ? cloudProvider : ollamaProvider;
}

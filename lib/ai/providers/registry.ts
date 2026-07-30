import type { AIProvider } from "../provider";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAIProvider } from "./openai";

type ProviderFactory = (apiKey: string) => AIProvider;

// Adding Gemini/OpenRouter/Grok later is one new provider file (matching
// this same factory shape) plus one entry here and in PROVIDER_PRIORITY --
// no changes to get-provider.ts, the chat route, or anything downstream.
export const PROVIDER_REGISTRY: Record<string, ProviderFactory> = {
  openai: createOpenAIProvider,
  anthropic: createAnthropicProvider,
};

// The order getProvider() checks the server's configured env vars in when
// more than one is set.
export const PROVIDER_PRIORITY = ["openai", "anthropic"] as const;

export type ProviderId = keyof typeof PROVIDER_REGISTRY;

// Server-side-only credentials -- set once per deployment (Vercel env vars),
// never per-user. Adding a new provider is one entry here plus one in
// PROVIDER_REGISTRY/PROVIDER_PRIORITY above.
export const PROVIDER_ENV_VARS: Record<ProviderId, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

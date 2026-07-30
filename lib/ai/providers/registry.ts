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

// The order getProvider() checks a user's saved keys in when more than one
// is configured.
export const PROVIDER_PRIORITY = ["openai", "anthropic"] as const;

export type ProviderId = keyof typeof PROVIDER_REGISTRY;

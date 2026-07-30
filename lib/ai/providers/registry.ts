import type { AIProvider } from "../provider";
import { createOpenAIProvider } from "./openai";

type ProviderFactory = (apiKey: string) => AIProvider;

// Adding Anthropic/Gemini/OpenRouter/Grok later is one new provider file
// (matching this same factory shape) plus one entry here -- no changes to
// get-provider.ts, the chat route, or anything downstream.
export const PROVIDER_REGISTRY: Record<string, ProviderFactory> = {
  openai: createOpenAIProvider,
};

export type ProviderId = keyof typeof PROVIDER_REGISTRY;

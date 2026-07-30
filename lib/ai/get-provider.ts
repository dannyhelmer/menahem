import type { AIProvider } from "./provider";
import { ollamaProvider } from "./ollama-provider";

export function getProvider(): AIProvider {
  return ollamaProvider;
}

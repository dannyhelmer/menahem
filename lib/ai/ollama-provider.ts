import type { AIProvider, StreamChatOptions, StreamChatResult } from "./provider";
import type { ChatMessage } from "./types";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:8b";

// Generous default -- comfortably fits a genuine ~1500-2000 word answer
// (verified live) without being unbounded. Callers that legitimately need
// more room (Deep Research) pass a higher maxTokens explicitly.
const DEFAULT_MAX_TOKENS = 3000;

function modelIsAvailable(modelName: string, availableModels: string[]): boolean {
  return availableModels.some(
    (name) => name === modelName || name.startsWith(`${modelName}:`),
  );
}

interface OllamaChatChunk {
  message?: { content?: string };
  done?: boolean;
  done_reason?: string;
}

class OllamaProvider implements AIProvider {
  readonly name = "ollama";

  async isConfigured(): Promise<boolean> {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { models?: { name: string }[] };
      const modelNames = (data.models ?? []).map((m) => m.name);
      return modelIsAvailable(OLLAMA_MODEL, modelNames);
    } catch {
      return false;
    }
  }

  async streamChat(
    messages: ChatMessage[],
    onChunk: (piece: string) => void,
    options?: StreamChatOptions,
  ): Promise<StreamChatResult> {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options?.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: true,
        // qwen3 has a separate hidden "thinking" phase that can consume its
        // entire token budget before any real answer text is produced --
        // disabling it keeps content starting on the first chunk.
        think: false,
        options: {
          num_predict: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
          num_ctx: 32768,
          temperature: 0.7,
          repeat_penalty: 1.15,
          top_p: 0.9,
          top_k: 40,
        },
      }),
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      throw new Error(`Ollama request failed (${response.status}): ${body || response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as OllamaChatChunk;
        const piece = chunk.message?.content;
        if (piece) onChunk(piece);
        if (chunk.done) return { truncated: chunk.done_reason === "length" };
      }
    }

    return { truncated: false };
  }
}

export const ollamaProvider = new OllamaProvider();

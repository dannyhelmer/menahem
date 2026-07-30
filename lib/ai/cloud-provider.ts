import type { AIProvider, StreamChatOptions, StreamChatResult } from "./provider";
import type { ChatMessage } from "./types";

// OpenAI-compatible Chat Completions endpoint -- works with OpenRouter,
// OpenAI itself, or any other compatible gateway by pointing
// CLOUD_AI_BASE_URL at it. Defaults to OpenRouter since one API key there
// covers many underlying models/providers.
const CLOUD_API_KEY = process.env.CLOUD_AI_API_KEY;
const CLOUD_BASE_URL = process.env.CLOUD_AI_BASE_URL ?? "https://openrouter.ai/api/v1";
const CLOUD_MODEL = process.env.CLOUD_AI_MODEL ?? "openai/gpt-4o-mini";

const DEFAULT_MAX_TOKENS = 3000;

interface CloudChatChunk {
  choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
}

class CloudProvider implements AIProvider {
  readonly name = "cloud";
  readonly description = `a cloud-hosted AI model (${CLOUD_MODEL})`;

  async isConfigured(): Promise<boolean> {
    return Boolean(CLOUD_API_KEY);
  }

  async streamChat(
    messages: ChatMessage[],
    onChunk: (piece: string) => void,
    options?: StreamChatOptions,
  ): Promise<StreamChatResult> {
    if (!CLOUD_API_KEY) {
      throw new Error("No cloud AI provider is configured for this deployment.");
    }

    const response = await fetch(`${CLOUD_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CLOUD_API_KEY}`,
      },
      signal: options?.signal,
      body: JSON.stringify({
        model: CLOUD_MODEL,
        messages,
        stream: true,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      throw new Error(`Cloud AI request failed (${response.status}): ${body || response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let truncated = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice("data:".length).trim();
        if (payload === "[DONE]") return { truncated };

        const chunk = JSON.parse(payload) as CloudChatChunk;
        const choice = chunk.choices?.[0];
        const piece = choice?.delta?.content;
        if (piece) onChunk(piece);
        if (choice?.finish_reason === "length") truncated = true;
      }
    }

    return { truncated };
  }
}

export const cloudProvider = new CloudProvider();

import type { AIProvider, StreamChatOptions, StreamChatResult } from "../provider";
import type { ChatMessage } from "../types";

// Anthropic's Messages API. Two real differences from OpenAI's shape that
// matter here: (1) auth is `x-api-key` + `anthropic-version`, not a Bearer
// token, and (2) system prompts are a separate top-level `system` field --
// Anthropic rejects a "system" role inside `messages`, so it has to be
// pulled out rather than passed through like every other provider.
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
const DEFAULT_MAX_TOKENS = 3000;

interface AnthropicStreamEvent {
  type?: string;
  delta?: { type?: string; text?: string; stop_reason?: string | null };
  error?: { message?: string };
}

export function createAnthropicProvider(apiKey: string): AIProvider {
  return {
    name: "anthropic",
    description: `Anthropic (${DEFAULT_MODEL})`,

    async isConfigured(): Promise<boolean> {
      return Boolean(apiKey);
    },

    async streamChat(
      messages: ChatMessage[],
      onChunk: (piece: string) => void,
      options?: StreamChatOptions,
    ): Promise<StreamChatResult> {
      const systemMessage = messages.find((m) => m.role === "system");
      const conversationMessages = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));

      console.log(
        `[anthropic] POST ${ANTHROPIC_MESSAGES_URL} model=${DEFAULT_MODEL} messages=${conversationMessages.length}`,
      );
      const response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        signal: options?.signal,
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: systemMessage?.content,
          messages: conversationMessages,
          stream: true,
        }),
      });
      console.log(`[anthropic] response status: ${response.status}`);

      if (!response.ok || !response.body) {
        const body = await response.text().catch(() => "");
        console.error(`[anthropic] request failed (${response.status}):`, body);
        throw new Error(`Anthropic request failed (${response.status}): ${body || response.statusText}`);
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
          if (!payload) continue;

          const event = JSON.parse(payload) as AnthropicStreamEvent;
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            onChunk(event.delta.text);
          } else if (event.type === "error") {
            throw new Error(event.error?.message ?? "Anthropic response failed.");
          } else if (event.type === "message_delta" && event.delta?.stop_reason === "max_tokens") {
            truncated = true;
          }
        }
      }

      return { truncated };
    },
  };
}

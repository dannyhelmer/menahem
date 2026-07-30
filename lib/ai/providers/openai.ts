import type { AIProvider, StreamChatOptions, StreamChatResult } from "../provider";
import type { ChatMessage } from "../types";

// OpenAI's Responses API (not Chat Completions) -- a different
// request/response shape: input is a plain message list, streaming comes
// back as named SSE events (response.output_text.delta for token pieces,
// response.completed/incomplete for the end of the turn).
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 3000;

interface ResponsesStreamEvent {
  type?: string;
  delta?: string;
  response?: {
    incomplete_details?: { reason?: string };
    error?: { message?: string };
  };
}

export function createOpenAIProvider(apiKey: string): AIProvider {
  return {
    name: "openai",
    description: `OpenAI (${DEFAULT_MODEL})`,

    async isConfigured(): Promise<boolean> {
      return Boolean(apiKey);
    },

    async streamChat(
      messages: ChatMessage[],
      onChunk: (piece: string) => void,
      options?: StreamChatOptions,
    ): Promise<StreamChatResult> {
      console.log(`[openai] POST ${OPENAI_RESPONSES_URL} model=${DEFAULT_MODEL} messages=${messages.length}`);
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: options?.signal,
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          input: messages,
          stream: true,
          max_output_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        }),
      });
      console.log(`[openai] response status: ${response.status}`);

      if (!response.ok || !response.body) {
        const body = await response.text().catch(() => "");
        console.error(`[openai] request failed (${response.status}):`, body);
        throw new Error(`OpenAI request failed (${response.status}): ${body || response.statusText}`);
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
          if (!payload || payload === "[DONE]") continue;

          const event = JSON.parse(payload) as ResponsesStreamEvent;
          if (event.type === "response.output_text.delta" && event.delta) {
            onChunk(event.delta);
          } else if (event.type === "response.failed") {
            throw new Error(event.response?.error?.message ?? "OpenAI response failed.");
          } else if (event.type === "response.completed" || event.type === "response.incomplete") {
            if (event.response?.incomplete_details?.reason === "max_output_tokens") truncated = true;
          }
        }
      }

      return { truncated };
    },
  };
}

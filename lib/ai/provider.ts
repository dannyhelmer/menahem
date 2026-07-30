import type { ChatMessage } from "./types";

export interface StreamChatOptions {
  signal?: AbortSignal;
  // Caps generation length (maps to Ollama's num_predict). Left unset, the
  // provider applies its own generous default -- callers that legitimately
  // need more room (Deep Research) can ask for a higher budget explicitly.
  maxTokens?: number;
}

export interface StreamChatResult {
  // True when generation stopped because it hit maxTokens/the context
  // window rather than reaching a natural end -- lets callers offer a
  // "Continue" affordance instead of silently presenting a cut-off answer
  // as if it were complete.
  truncated: boolean;
}

export interface AIProvider {
  readonly name: string;
  // Human-readable description of the active backend, surfaced in the
  // system prompt so Menahem can truthfully answer "what model are you
  // running on" regardless of which provider is actually active.
  readonly description: string;
  isConfigured(): Promise<boolean>;
  streamChat(
    messages: ChatMessage[],
    onChunk: (piece: string) => void,
    options?: StreamChatOptions,
  ): Promise<StreamChatResult>;
}

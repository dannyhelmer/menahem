"use client";

import { useRef, useState } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import { useConversationsRefresh } from "./ConversationsProvider";
import type { UiMessage } from "./chat-types";

function createId(): string {
  return crypto.randomUUID();
}

const CONTINUE_INSTRUCTION =
  "Continue your previous answer exactly where it left off. Do not repeat, restate, or summarize anything " +
  "you've already written -- continue seamlessly as if uninterrupted, with no new greeting or preamble.";

interface StreamFrame {
  type: string;
  value?: string;
  message?: string;
  label?: string;
  sources?: { title: string; url: string }[];
  level?: "high" | "medium" | "low";
  reason?: string;
  suggestions?: string[];
  content?: string;
}

// Shared NDJSON frame reader for /api/chat's streaming response -- used by
// both a fresh send and a "Continue Report" resume, which differ only in
// how they interpret a `token`/`truncated` frame's content, not in how
// frames are parsed off the wire.
async function parseChatStream(
  response: Response,
  handlers: {
    onToken: (piece: string) => void;
    onStatus?: (label: string) => void;
    onSources?: (sources: { title: string; url: string }[]) => void;
    onConfidence?: (level: "high" | "medium" | "low", reason?: string) => void;
    onFollowups?: (suggestions: string[]) => void;
    onTruncated?: (content: string) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  if (!response.body) return;
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
      const frame = JSON.parse(line) as StreamFrame;
      if (frame.type === "token" && frame.value) {
        handlers.onToken(frame.value);
      } else if (frame.type === "status" && frame.label) {
        handlers.onStatus?.(frame.label);
      } else if (frame.type === "sources" && frame.sources) {
        handlers.onSources?.(frame.sources);
      } else if (frame.type === "confidence" && frame.level) {
        handlers.onConfidence?.(frame.level, frame.reason);
      } else if (frame.type === "followups" && frame.suggestions) {
        handlers.onFollowups?.(frame.suggestions);
      } else if (frame.type === "truncated" && frame.content !== undefined) {
        handlers.onTruncated?.(frame.content);
      } else if (frame.type === "error") {
        handlers.onError(frame.message ?? "Something went wrong.");
      }
    }
  }
}

// Owns everything about running a conversation against /api/chat -- message
// state, the streaming fetch loop, and session-id/URL bookkeeping. Extracted
// out of ChatView (Phase 13) so a dedicated research page can host its own
// independent session with the exact same mechanics, just tagged with a
// category for pipeline context and "recent searches" grouping.
export function useChatSession({
  initialSessionId,
  initialMessages,
  category,
  documentId,
}: {
  initialSessionId?: string;
  initialMessages?: UiMessage[];
  category?: string;
  documentId?: string;
}) {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages ?? []);
  const [status, setStatus] = useState<"idle" | "streaming">("idle");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);
  const sessionIdRef = useRef<string | undefined>(initialSessionId);
  const { refresh } = useConversationsRefresh();

  function appendToLastAssistantMessage(assistantId: string, piece: string) {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId
          ? { ...message, content: message.content + piece }
          : message,
      ),
    );
  }

  function markLastAssistantMessageAsError(assistantId: string, text: string) {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId ? { ...message, content: text, error: true } : message,
      ),
    );
  }

  function setAssistantStatusLabel(assistantId: string, statusLabel: string) {
    setMessages((prev) =>
      prev.map((message) => (message.id === assistantId ? { ...message, statusLabel } : message)),
    );
  }

  function setAssistantSources(assistantId: string, sources: { title: string; url: string }[]) {
    setMessages((prev) =>
      prev.map((message) => (message.id === assistantId ? { ...message, sources } : message)),
    );
  }

  function setAssistantConfidence(
    assistantId: string,
    confidence: "high" | "medium" | "low",
    confidenceReason?: string,
  ) {
    setMessages((prev) =>
      prev.map((message) => (message.id === assistantId ? { ...message, confidence, confidenceReason } : message)),
    );
  }

  function setAssistantFollowups(assistantId: string, followups: string[]) {
    setMessages((prev) =>
      prev.map((message) => (message.id === assistantId ? { ...message, followups } : message)),
    );
  }

  async function sendMessage(content: string, overrides?: { deepResearchEnabled?: boolean }) {
    const trimmed = content.trim();
    if (!trimmed || status === "streaming") return;

    const history: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    const assistantId = createId();

    setMessages((prev) => [
      ...prev,
      { id: createId(), role: "user", content: trimmed },
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setStatus("streaming");
    const searchRequested = webSearchEnabled;
    const deepResearchRequested = overrides?.deepResearchEnabled ?? deepResearchEnabled;
    setWebSearchEnabled(false);
    setDeepResearchEnabled(false);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          sessionId: sessionIdRef.current,
          webSearchEnabled: searchRequested,
          deepResearchEnabled: deepResearchRequested,
          category,
          documentId,
        }),
      });

      const returnedSessionId = response.headers.get("X-Session-Id");
      if (returnedSessionId && returnedSessionId !== sessionIdRef.current) {
        sessionIdRef.current = returnedSessionId;
        window.history.replaceState(null, "", `/c/${returnedSessionId}`);
        refresh();
      }

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        markLastAssistantMessageAsError(
          assistantId,
          data?.error ?? "Something went wrong reaching Menahem.",
        );
        return;
      }

      await parseChatStream(response, {
        onToken: (piece) => appendToLastAssistantMessage(assistantId, piece),
        onStatus: (label) => setAssistantStatusLabel(assistantId, label),
        onSources: (sources) => setAssistantSources(assistantId, sources),
        onConfidence: (level, reason) => setAssistantConfidence(assistantId, level, reason),
        onFollowups: (suggestions) => setAssistantFollowups(assistantId, suggestions),
        onTruncated: (fullTrimmedContent) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: fullTrimmedContent, truncated: true } : m,
            ),
          );
        },
        onError: (message) => markLastAssistantMessageAsError(assistantId, message),
      });
    } catch {
      markLastAssistantMessageAsError(assistantId, "Lost connection to Menahem. Please try again.");
    } finally {
      setStatus("idle");
      // The session title is generated asynchronously after the stream
      // closes -- one extra refresh a couple seconds later is a cheap way
      // to pick it up without a push-based mechanism.
      setTimeout(refresh, 2500);
    }
  }

  // Resumes a truncated assistant message exactly where it left off,
  // appending the continuation to the SAME message bubble rather than
  // starting a new exchange.
  async function continueMessage(assistantId: string) {
    if (status === "streaming") return;
    const index = messages.findIndex((m) => m.id === assistantId);
    if (index === -1) return;
    const target = messages[index];
    if (target.role !== "assistant") return;

    const baseContent = target.content;
    const historyUpToTarget: ChatMessage[] = messages
      .slice(0, index + 1)
      .map((m) => ({ role: m.role, content: m.content }));

    setStatus("streaming");
    setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, truncated: false } : m)));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...historyUpToTarget, { role: "user", content: CONTINUE_INSTRUCTION }],
          sessionId: sessionIdRef.current,
          continuation: true,
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        markLastAssistantMessageAsError(
          assistantId,
          data?.error ?? "Something went wrong reaching Menahem.",
        );
        return;
      }

      await parseChatStream(response, {
        onToken: (piece) => appendToLastAssistantMessage(assistantId, piece),
        onTruncated: (trimmedDelta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: baseContent + trimmedDelta, truncated: true } : m,
            ),
          );
        },
        onError: (message) => markLastAssistantMessageAsError(assistantId, message),
      });
    } catch {
      markLastAssistantMessageAsError(assistantId, "Lost connection to Menahem. Please try again.");
    } finally {
      setStatus("idle");
      setTimeout(refresh, 2500);
    }
  }

  // Re-asks the question that produced this assistant message, forcing
  // Deep Research mode -- the "Deep Research" action on a truncated (or any)
  // reply. Finds the nearest preceding user turn rather than requiring
  // every caller to look it up themselves.
  function retryWithDeepResearch(assistantId: string) {
    const index = messages.findIndex((m) => m.id === assistantId);
    if (index === -1) return;
    const priorUser = [...messages.slice(0, index)].reverse().find((m) => m.role === "user");
    if (priorUser) sendMessage(priorUser.content, { deepResearchEnabled: true });
  }

  return {
    messages,
    status,
    webSearchEnabled,
    toggleWebSearch: () => setWebSearchEnabled((prev) => !prev),
    deepResearchEnabled,
    toggleDeepResearch: () => setDeepResearchEnabled((prev) => !prev),
    sendMessage,
    continueMessage,
    retryWithDeepResearch,
  };
}

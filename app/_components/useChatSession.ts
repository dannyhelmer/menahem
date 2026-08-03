"use client";

import { useRef, useState } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import { useConversationsRefresh } from "./ConversationsProvider";
import type { AttachedDocumentState, UiMessage } from "./chat-types";

function createId(): string {
  return crypto.randomUUID();
}

// The session's real title is generated asynchronously on the server after
// the first reply (see route.ts's `after()` hook) -- there's no push
// mechanism, so this re-fetches shortly after a stream ends to pick it up
// and update the browser tab, since transitioning from a brand-new chat to
// its generated title happens via history.replaceState (below), not a real
// Next.js navigation, so generateMetadata never gets a chance to run for it.
async function syncDocumentTitle(sessionId: string) {
  try {
    const response = await fetch(`/api/conversations/${sessionId}`);
    if (!response.ok) return;
    const session = (await response.json()) as { title?: string };
    if (!session.title) return;
    document.title = session.title === "New conversation" ? "Menahem" : `${session.title} | Menahem`;
  } catch {
    // Non-critical -- leave whatever title is currently showing.
  }
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
// Client-side backstop -- if the server ever goes fully silent (no frame at
// all, not even a status update) for this long, treat it as a hang rather
// than waiting forever. This should rarely fire given the server's own
// search/model timeouts, but a network hiccup or an unforeseen server bug
// must never leave the UI stuck with no feedback and no way out.
const STREAM_STALL_TIMEOUT_MS = 35_000;

class StreamStallError extends Error {}

function raceWithStall<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new StreamStallError(`No data received for ${STREAM_STALL_TIMEOUT_MS}ms`)),
      STREAM_STALL_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

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
    let done: boolean, value: Uint8Array | undefined;
    try {
      ({ done, value } = await raceWithStall(reader.read()));
    } catch (err) {
      if (err instanceof StreamStallError) {
        console.error("[chat] stream stalled with no data:", err.message);
        handlers.onError("I'm having trouble retrieving a response right now. Please try again in a moment.");
        reader.cancel().catch(() => {});
        return;
      }
      throw err;
    }
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
  initialDocumentId,
}: {
  initialSessionId?: string;
  initialMessages?: UiMessage[];
  category?: string;
  // A fixed document context for the whole session (e.g. DocumentQnA's
  // embedded per-document panel) -- distinct from the composer's own
  // upload flow below, which lets the document attached to a message
  // change turn to turn.
  initialDocumentId?: string;
}) {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages ?? []);
  const [status, setStatus] = useState<"idle" | "streaming">("idle");
  // Persisted across the whole conversation (and page refreshes) -- once a
  // user turns Web Search on, it should stay on until THEY explicitly turn
  // it off, not silently reset after every message.
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("menahem:webSearchEnabled") === "true";
  });
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);
  const [attachedDocument, setAttachedDocument] = useState<AttachedDocumentState | null>(null);
  const [documentId, setDocumentId] = useState<string | undefined>(initialDocumentId);

  // Owned here (not by the calling view) so it's available identically
  // whether the composer is currently rendered via Dashboard (no messages
  // yet) or ConversationThread (mid-conversation) -- previously this lived
  // in ChatView and was only ever wired into Dashboard's PromptInput, so the
  // attach button silently disappeared the moment the first message sent
  // and the view switched to ConversationThread.
  async function uploadDocument(file: File) {
    setAttachedDocument({ filename: file.name, status: "uploading" });
    try {
      // A document attached directly in the chat composer isn't part of any
      // Political Workspace project -- uploading with just a file (Free
      // tier: 3/day) is a different feature from Political Workspace
      // (Pro-only, project-based). Previously this created a hidden project
      // first just to satisfy documents.project_id's old NOT NULL
      // constraint, which meant every free-tier attachment 403'd on project
      // creation before the upload itself ever ran -- see lib/db/schema.ts.
      const formData = new FormData();
      formData.append("file", file);
      const documentRes = await fetch("/api/documents", { method: "POST", body: formData });
      if (!documentRes.ok) {
        const body = await documentRes.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Upload failed. Try again.");
      }
      const document = (await documentRes.json()) as { id: string };

      setDocumentId(document.id);
      setAttachedDocument({ filename: file.name, status: "ready" });
    } catch (err) {
      setAttachedDocument({
        filename: file.name,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Upload failed. Try again.",
      });
    }
  }

  function clearAttachedDocument() {
    setAttachedDocument(null);
    setDocumentId(undefined);
  }

  function toggleWebSearch() {
    setWebSearchEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("menahem:webSearchEnabled", String(next));
      }
      return next;
    });
  }
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
      prev.map((message) =>
        message.id === assistantId
          ? { ...message, statusLabel, searchProgress: [...(message.searchProgress ?? []), statusLabel] }
          : message,
      ),
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

    // messages is UiMessage[] (id, sources, confidence, etc. beyond role/
    // content) -- spreading those objects as-is would serialize the extra
    // fields into the request body too, including our own internal `id`.
    // OpenAI's Responses API interprets a present `id` on an input item as
    // a reference to one of ITS OWN "msg_*"-prefixed items and rejects
    // anything else, so every provider gets a plain {role, content} replay
    // of history, never our internal identifiers.
    const history: ChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: trimmed },
    ];
    const assistantId = createId();
    // Captured before any state updates below -- this is the document (if
    // any) attached to THIS specific message, not whatever's still in
    // state after it's cleared a few lines down.
    const documentIdForThisMessage = documentId;
    const attachedFilename = attachedDocument?.status === "ready" ? attachedDocument.filename : undefined;

    setMessages((prev) => [
      ...prev,
      { id: createId(), role: "user", content: trimmed, attachedFilename },
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setStatus("streaming");
    const searchRequested = webSearchEnabled;
    const deepResearchRequested = overrides?.deepResearchEnabled ?? deepResearchEnabled;
    // Web Search is a persistent conversation-level mode now, not a one-shot
    // action -- it stays enabled until the user explicitly turns it off (see
    // toggleWebSearch above). Deep Research is still a per-message action.
    setDeepResearchEnabled(false);
    // A composer-driven attachment belongs to THIS message only -- clear it
    // so it doesn't silently keep applying to every later, unrelated
    // message. A session that started with a fixed initialDocumentId (e.g.
    // DocumentQnA's embedded per-document panel) never sets
    // attachedDocument at all, so that fixed context is left untouched here.
    if (attachedDocument) {
      setAttachedDocument(null);
      setDocumentId(undefined);
    }

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
          documentId: documentIdForThisMessage,
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
      const currentSessionId = sessionIdRef.current;
      setTimeout(() => {
        refresh();
        if (currentSessionId) syncDocumentTitle(currentSessionId);
      }, 2500);
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
    toggleWebSearch,
    deepResearchEnabled,
    toggleDeepResearch: () => setDeepResearchEnabled((prev) => !prev),
    sendMessage,
    continueMessage,
    retryWithDeepResearch,
    attachedDocument,
    uploadDocument,
    clearAttachedDocument,
  };
}

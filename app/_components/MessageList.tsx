"use client";

import { useEffect, useState } from "react";
import MessageBubble from "./MessageBubble";
import type { UiMessage } from "./chat-types";

// Elapsed seconds since retrieval/generation started for the current
// in-flight message -- resets automatically whenever `active` flips off
// (message finished) then on again (a new message started).
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const start = Date.now();
    setSeconds(0);
    const interval = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [active]);
  return seconds;
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function MessageList({
  messages,
  streaming,
  onSelectFollowup,
  onContinue,
  onDeepResearch,
}: {
  messages: UiMessage[];
  streaming: boolean;
  onSelectFollowup: (text: string) => void;
  onContinue: (assistantId: string) => void;
  onDeepResearch: (assistantId: string) => void;
}) {
  const lastMessage = messages[messages.length - 1];
  // True from the moment a message is sent until the first token actually
  // arrives -- retrieval (search/gov-data lookups) happens entirely within
  // this window, before any part of the answer is generated. This is a
  // dedicated loading surface OUTSIDE the assistant's own message bubble,
  // not text inside the eventual response.
  const isThinking = streaming && lastMessage?.role === "assistant" && lastMessage.content === "";
  const elapsed = useElapsedSeconds(isThinking);

  // Always shown until the server's first real status update arrives --
  // there is never a blank/silent gap between hitting send and seeing
  // feedback.
  const currentLabel = lastMessage?.searchProgress?.length
    ? lastMessage.searchProgress[lastMessage.searchProgress.length - 1]
    : lastMessage?.statusLabel
      ? `${lastMessage.statusLabel}…`
      : "Searching official government sources...";

  return (
    <div className="flex flex-col gap-6">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onSelectFollowup={onSelectFollowup}
          onContinue={onContinue}
          onDeepResearch={onDeepResearch}
        />
      ))}
      {isThinking && (
        <div className="flex flex-col gap-1.5 px-1 py-1" role="status" aria-live="polite">
          {(lastMessage.searchProgress ?? []).slice(0, -1).map((line, index) => (
            <span key={index} className="text-sm text-neutral-400 dark:text-neutral-500">
              {line}
            </span>
          ))}
          <div className="flex items-center gap-2.5">
            <svg
              className="h-3.5 w-3.5 shrink-0 animate-spin text-neutral-400 dark:text-neutral-500"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            <span className="text-sm text-neutral-400 dark:text-neutral-500">{currentLabel}</span>
            <span className="font-mono text-xs tabular-nums text-neutral-300 dark:text-neutral-600">
              {formatElapsed(elapsed)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

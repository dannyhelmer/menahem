"use client";

import { useEffect, useRef } from "react";
import ChatDisclaimer from "./ChatDisclaimer";
import type { UiMessage } from "./chat-types";
import MessageList from "./MessageList";
import PromptInput from "./PromptInput";

// The populated-conversation view (message list + bottom-anchored composer)
// -- shared between the home ChatView and every dedicated research page, so
// a conversation looks and behaves identically no matter where it started.
export default function ConversationThread({
  messages,
  streaming,
  draft,
  onChange,
  onSubmit,
  onSelectFollowup,
  onContinue,
  onDeepResearch,
  webSearchEnabled,
  onToggleWebSearch,
  deepResearchEnabled,
  onToggleDeepResearch,
}: {
  messages: UiMessage[];
  streaming: boolean;
  draft: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSelectFollowup: (text: string) => void;
  onContinue: (assistantId: string) => void;
  onDeepResearch: (assistantId: string) => void;
  webSearchEnabled: boolean;
  onToggleWebSearch: () => void;
  deepResearchEnabled: boolean;
  onToggleDeepResearch: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <MessageList
            messages={messages}
            streaming={streaming}
            onSelectFollowup={onSelectFollowup}
            onContinue={onContinue}
            onDeepResearch={onDeepResearch}
          />
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="border-t border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div className="mx-auto max-w-2xl space-y-3">
          <PromptInput
            value={draft}
            onChange={onChange}
            onSubmit={onSubmit}
            disabled={streaming}
            webSearchEnabled={webSearchEnabled}
            onToggleWebSearch={onToggleWebSearch}
            deepResearchEnabled={deepResearchEnabled}
            onToggleDeepResearch={onToggleDeepResearch}
          />
          <ChatDisclaimer />
        </div>
      </div>
    </main>
  );
}

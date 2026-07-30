"use client";

import { useState } from "react";
import ChatDisclaimer from "./ChatDisclaimer";
import MessageList from "./MessageList";
import PromptInput from "./PromptInput";
import { useChatSession } from "./useChatSession";

// Compact, embedded Q&A for a single uploaded document -- reuses the exact
// same session/streaming mechanics as every other chat surface (Phase
// 13/14's useChatSession), just rendered inline instead of as a full page.
export default function DocumentQnA({ documentId }: { documentId: string }) {
  const [draft, setDraft] = useState("");
  const {
    messages,
    status,
    webSearchEnabled,
    toggleWebSearch,
    deepResearchEnabled,
    toggleDeepResearch,
    sendMessage,
    continueMessage,
    retryWithDeepResearch,
  } = useChatSession({ initialDocumentId: documentId });

  function handleSubmit() {
    sendMessage(draft);
    setDraft("");
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/40">
      {messages.length > 0 && (
        <div className="max-h-80 overflow-y-auto">
          <MessageList
            messages={messages}
            streaming={status === "streaming"}
            onSelectFollowup={sendMessage}
            onContinue={continueMessage}
            onDeepResearch={retryWithDeepResearch}
          />
        </div>
      )}
      <PromptInput
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        disabled={status === "streaming"}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={toggleWebSearch}
        deepResearchEnabled={deepResearchEnabled}
        onToggleDeepResearch={toggleDeepResearch}
      />
      <ChatDisclaimer />
    </div>
  );
}

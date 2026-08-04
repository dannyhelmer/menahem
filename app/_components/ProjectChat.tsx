"use client";

import { useState } from "react";
import ChatDisclaimer from "./ChatDisclaimer";
import MessageList from "./MessageList";
import PromptInput from "./PromptInput";
import { useChatSession } from "./useChatSession";

// Document Intelligence Phase 5: chat scoped to a whole Political Workspace
// project rather than one document -- mirrors DocumentQnA's embedded-panel
// pattern exactly, just with initialProjectId instead of
// initialDocumentId. Every document saved in this project is
// automatically available as context (retrieved dynamically per question,
// server-side -- see buildWorkspaceDocumentContext in
// app/api/chat/route.ts), with no per-message attachment needed.
export default function ProjectChat({ projectId }: { projectId: string }) {
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
  } = useChatSession({ initialProjectId: projectId });

  function handleSubmit() {
    sendMessage(draft);
    setDraft("");
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/40">
      {messages.length > 0 && (
        <div className="max-h-96 overflow-y-auto">
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

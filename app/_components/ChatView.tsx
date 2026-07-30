"use client";

import { useState } from "react";
import type { GraphEntity } from "@/lib/graph/types";
import ConversationThread from "./ConversationThread";
import Dashboard from "./Dashboard";
import type { UiMessage } from "./chat-types";
import { useChatSession } from "./useChatSession";

export default function ChatView({
  initialSessionId,
  initialMessages,
  recentEntities = [],
}: {
  initialSessionId?: string;
  initialMessages?: UiMessage[];
  recentEntities?: GraphEntity[];
}) {
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
  } = useChatSession({ initialSessionId, initialMessages });

  function handleSubmit() {
    sendMessage(draft);
    setDraft("");
  }

  if (messages.length === 0) {
    return (
      <Dashboard
        draft={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={toggleWebSearch}
        deepResearchEnabled={deepResearchEnabled}
        onToggleDeepResearch={toggleDeepResearch}
        recentEntities={recentEntities}
      />
    );
  }

  return (
    <ConversationThread
      messages={messages}
      streaming={status === "streaming"}
      draft={draft}
      onChange={setDraft}
      onSubmit={handleSubmit}
      onSelectFollowup={sendMessage}
      onContinue={continueMessage}
      onDeepResearch={retryWithDeepResearch}
      webSearchEnabled={webSearchEnabled}
      onToggleWebSearch={toggleWebSearch}
      deepResearchEnabled={deepResearchEnabled}
      onToggleDeepResearch={toggleDeepResearch}
    />
  );
}

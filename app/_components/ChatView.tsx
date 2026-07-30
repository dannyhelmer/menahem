"use client";

import { useState } from "react";
import type { GraphEntity } from "@/lib/graph/types";
import { deriveProjectName } from "@/lib/documents/derive-project-name";
import ApiKeyOnboarding from "./ApiKeyOnboarding";
import ConversationThread from "./ConversationThread";
import Dashboard from "./Dashboard";
import type { AttachedDocumentState } from "./PromptInput";
import type { UiMessage } from "./chat-types";
import { useChatSession } from "./useChatSession";

export default function ChatView({
  initialSessionId,
  initialMessages,
  recentEntities = [],
  needsApiKey = false,
}: {
  initialSessionId?: string;
  initialMessages?: UiMessage[];
  recentEntities?: GraphEntity[];
  needsApiKey?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [attachedDocument, setAttachedDocument] = useState<AttachedDocumentState | null>(null);
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | undefined>(undefined);
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
  } = useChatSession({ initialSessionId, initialMessages, documentId: uploadedDocumentId });

  function handleSubmit() {
    sendMessage(draft);
    setDraft("");
  }

  // No project already selected on this screen -- auto-create one named
  // after the file (bill-shaped names like "HR1.pdf" become "H.R. 1", a
  // generic/unnamed file falls back to "Research – <date>") rather than
  // interrupting the upload to ask first. Renamed/reorganized later from
  // Political Workspace.
  async function handleUploadDocument(file: File) {
    setAttachedDocument({ filename: file.name, status: "uploading" });
    try {
      const projectRes = await fetch("/api/notebook/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deriveProjectName(file.name) }),
      });
      if (!projectRes.ok) throw new Error("Failed to create project");
      const project = (await projectRes.json()) as { id: string };

      const formData = new FormData();
      formData.append("projectId", project.id);
      formData.append("file", file);
      const documentRes = await fetch("/api/documents", { method: "POST", body: formData });
      if (!documentRes.ok) throw new Error("Failed to upload document");
      const document = (await documentRes.json()) as { id: string };

      setUploadedDocumentId(document.id);
      setAttachedDocument({ filename: file.name, status: "ready" });
    } catch {
      setAttachedDocument({ filename: file.name, status: "error" });
    }
  }

  function handleClearAttachedDocument() {
    setAttachedDocument(null);
    setUploadedDocumentId(undefined);
  }

  if (needsApiKey) {
    return <ApiKeyOnboarding />;
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
        onUploadDocument={handleUploadDocument}
        attachedDocument={attachedDocument}
        onClearAttachedDocument={handleClearAttachedDocument}
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

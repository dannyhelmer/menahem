import type { ChatMessage } from "@/lib/ai/types";

export interface AttachedDocumentState {
  filename: string;
  status: "uploading" | "ready" | "error";
}

export interface UiMessage extends ChatMessage {
  id: string;
  error?: boolean;
  statusLabel?: string;
  sources?: { title: string; url: string }[];
  confidence?: "high" | "medium" | "low";
  confidenceReason?: string;
  followups?: string[];
  truncated?: boolean;
  // Set on a user message when a document was attached at send time -- kept
  // on the message itself so the history shows which turn it belonged to,
  // rather than a single ambient "current attachment" with no record of
  // which question it was actually for.
  attachedFilename?: string;
}

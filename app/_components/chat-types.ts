import type { ChatMessage } from "@/lib/ai/types";

export interface AttachedDocumentState {
  filename: string;
  status: "uploading" | "ready" | "error";
  // The actual reason an upload failed (file too large, unsupported type,
  // upload limit reached, unreadable content, etc.) -- shown to the user
  // instead of a generic "Failed to upload" that gives no indication of
  // what actually went wrong or how to fix it.
  errorMessage?: string;
}

export interface UiMessage extends ChatMessage {
  id: string;
  error?: boolean;
  statusLabel?: string;
  // Accumulates every status update received while this message is still
  // streaming (e.g. "Searching trusted government and news sources...",
  // "✓ Reuters", "✓ Congress.gov", "Generating response...") so the
  // "thinking" indicator can show real progress instead of just bouncing
  // dots with no explanation for however long the search phase takes.
  searchProgress?: string[];
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

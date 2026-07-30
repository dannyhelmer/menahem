import type { ChatMessage } from "@/lib/ai/types";

export interface UiMessage extends ChatMessage {
  id: string;
  error?: boolean;
  statusLabel?: string;
  sources?: { title: string; url: string }[];
  confidence?: "high" | "medium" | "low";
  confidenceReason?: string;
  followups?: string[];
  truncated?: boolean;
}

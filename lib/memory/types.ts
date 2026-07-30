export interface ConversationSummary {
  sessionId: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string | null;
  pinned: boolean;
  messageCount: number;
  // Set only when the session was created from a dedicated research page
  // (Phase 13) -- lets that page's "recent searches" query real history
  // instead of showing nothing or something fabricated.
  category?: string;
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: { title: string; url: string }[];
  confidence?: "high" | "medium" | "low";
  confidenceReason?: string;
  // True when this message's generation was cut off by the length cap --
  // lets the UI offer "Continue Report" instead of presenting a truncated
  // answer as if it were complete.
  truncated?: boolean;
}

export interface ConversationSession {
  sessionId: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  messages: StoredMessage[];
  category?: string;
}

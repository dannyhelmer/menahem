import { ensureSchema } from "@/lib/db/schema";
import { sql } from "@/lib/db/client";
import { FALLBACK_TITLE } from "./title";
import type { ConversationSession, ConversationSummary, StoredMessage } from "./types";

const SESSION_ID_RE = /^[0-9a-f-]{36}$/i;

export function isValidSessionId(value: string): boolean {
  return SESSION_ID_RE.test(value);
}

interface ConversationRow {
  session_id: string;
  date: string;
  title: string;
  start_time: string;
  end_time: string | null;
  pinned: boolean;
  category: string | null;
  messages: StoredMessage[];
}

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    sessionId: row.session_id,
    date: row.date,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    pinned: row.pinned,
    messageCount: row.messages.length,
    category: row.category ?? undefined,
  };
}

function toSession(row: ConversationRow): ConversationSession {
  return {
    sessionId: row.session_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title,
    messages: row.messages,
    category: row.category ?? undefined,
  };
}

export async function loadIndex(userId: string): Promise<ConversationSummary[]> {
  await ensureSchema();
  const rows = (await sql`
    SELECT session_id, date, title, start_time, end_time, pinned, category, messages
    FROM conversations WHERE user_id = ${userId}
  `) as ConversationRow[];
  return rows.map(toSummary);
}

export async function loadSession(sessionId: string, userId: string): Promise<ConversationSession | null> {
  await ensureSchema();
  const rows = (await sql`
    SELECT session_id, date, title, start_time, end_time, pinned, category, messages
    FROM conversations WHERE session_id = ${sessionId} AND user_id = ${userId}
  `) as ConversationRow[];
  if (!rows[0]) return null;
  return toSession(rows[0]);
}

// Creates the session lazily on the first call -- a session with zero
// messages is never written. `category` is only meaningful at creation
// time (Phase 13's research pages tag a session with where it was started)
// and is ignored on subsequent calls for an existing session.
export async function appendMessage(
  sessionId: string,
  userId: string,
  message: Omit<StoredMessage, "timestamp">,
  category?: string,
): Promise<ConversationSession> {
  await ensureSchema();
  const now = new Date();
  const existing = await loadSession(sessionId, userId);

  if (!existing) {
    const messages = [{ ...message, timestamp: now.toISOString() }];
    await sql`
      INSERT INTO conversations (session_id, user_id, date, title, start_time, end_time, category, messages)
      VALUES (
        ${sessionId}, ${userId}, ${now.toISOString().slice(0, 10)}, ${FALLBACK_TITLE},
        ${now.toISOString()}, null, ${category ?? null}, ${JSON.stringify(messages)}
      )
    `;
    return {
      sessionId,
      date: now.toISOString().slice(0, 10),
      startTime: now.toISOString(),
      endTime: null,
      title: FALLBACK_TITLE,
      messages,
      category,
    };
  }

  const messages = [...existing.messages, { ...message, timestamp: now.toISOString() }];
  await sql`
    UPDATE conversations SET messages = ${JSON.stringify(messages)}, updated_at = now()
    WHERE session_id = ${sessionId} AND user_id = ${userId}
  `;
  return { ...existing, messages };
}

// For "Continue Report" -- appends to the LAST stored message (which must
// be the assistant message being continued) instead of pushing a new one.
export async function appendToLastMessage(
  sessionId: string,
  userId: string,
  additionalContent: string,
  fields?: { sources?: StoredMessage["sources"]; confidence?: StoredMessage["confidence"]; confidenceReason?: string; truncated?: boolean },
): Promise<void> {
  const session = await loadSession(sessionId, userId);
  if (!session) return;
  const last = session.messages[session.messages.length - 1];
  if (!last || last.role !== "assistant") return;

  last.content += additionalContent;
  if (fields?.sources !== undefined) last.sources = fields.sources;
  if (fields?.confidence !== undefined) last.confidence = fields.confidence;
  if (fields?.confidenceReason !== undefined) last.confidenceReason = fields.confidenceReason;
  last.truncated = fields?.truncated ?? false;

  await sql`
    UPDATE conversations SET messages = ${JSON.stringify(session.messages)}, updated_at = now()
    WHERE session_id = ${sessionId} AND user_id = ${userId}
  `;
}

export async function touchEndTime(sessionId: string, userId: string): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE conversations SET end_time = now(), updated_at = now()
    WHERE session_id = ${sessionId} AND user_id = ${userId}
  `;
}

export async function setPinned(sessionId: string, userId: string, pinned: boolean): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE conversations SET pinned = ${pinned}, updated_at = now()
    WHERE session_id = ${sessionId} AND user_id = ${userId}
  `;
}

export async function renameSession(sessionId: string, userId: string, title: string): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE conversations SET title = ${title}, updated_at = now()
    WHERE session_id = ${sessionId} AND user_id = ${userId}
  `;
}

// Only ever called from the explicit user-initiated delete action (the
// sidebar "Delete" confirm dialog / DELETE /api/conversations/[sessionId]) --
// never from any background or cleanup path.
export async function deleteSession(sessionId: string, userId: string): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM conversations WHERE session_id = ${sessionId} AND user_id = ${userId}`;
}

export async function listPinned(userId: string): Promise<ConversationSummary[]> {
  await ensureSchema();
  const rows = (await sql`
    SELECT session_id, date, title, start_time, end_time, pinned, category, messages
    FROM conversations WHERE user_id = ${userId} AND pinned = true
    ORDER BY start_time DESC
  `) as ConversationRow[];
  return rows.map(toSummary);
}

export async function listRecent(
  userId: string,
  limit = 8,
  excludePinned = true,
): Promise<ConversationSummary[]> {
  await ensureSchema();
  const rows = excludePinned
    ? ((await sql`
        SELECT session_id, date, title, start_time, end_time, pinned, category, messages
        FROM conversations WHERE user_id = ${userId} AND pinned = false
        ORDER BY start_time DESC LIMIT ${limit}
      `) as ConversationRow[])
    : ((await sql`
        SELECT session_id, date, title, start_time, end_time, pinned, category, messages
        FROM conversations WHERE user_id = ${userId}
        ORDER BY start_time DESC LIMIT ${limit}
      `) as ConversationRow[]);
  return rows.map(toSummary);
}

// "Recent searches" for a dedicated research page (Phase 13).
export async function listByCategory(userId: string, category: string, limit = 5): Promise<ConversationSummary[]> {
  await ensureSchema();
  const rows = (await sql`
    SELECT session_id, date, title, start_time, end_time, pinned, category, messages
    FROM conversations WHERE user_id = ${userId} AND category = ${category}
    ORDER BY start_time DESC LIMIT ${limit}
  `) as ConversationRow[];
  return rows.map(toSummary);
}

// Resolves a set of session ids to their summaries -- used by a research
// project (Phase 14) to display its linked conversations.
export async function getSummaries(userId: string, sessionIds: string[]): Promise<ConversationSummary[]> {
  if (sessionIds.length === 0) return [];
  await ensureSchema();
  const rows = (await sql`
    SELECT session_id, date, title, start_time, end_time, pinned, category, messages
    FROM conversations WHERE user_id = ${userId} AND session_id = ANY(${sessionIds})
  `) as ConversationRow[];
  const byId = new Map(rows.map((r) => [r.session_id, toSummary(r)]));
  return sessionIds.map((id) => byId.get(id)).filter((e): e is ConversationSummary => Boolean(e));
}

import path from "node:path";
import { unlink } from "node:fs/promises";
import { DATA_DIR, readJsonFile, writeJsonFileAtomic } from "@/lib/storage/json-file";
import { FALLBACK_TITLE } from "./title";
import type { ConversationSession, ConversationSummary, StoredMessage } from "./types";

const CONVERSATIONS_DIR = path.join(DATA_DIR, "conversations");
const INDEX_PATH = path.join(CONVERSATIONS_DIR, "index.json");

const SESSION_ID_RE = /^[0-9a-f-]{36}$/i;

export function isValidSessionId(value: string): boolean {
  return SESSION_ID_RE.test(value);
}

function sessionPath(date: string, sessionId: string): string {
  return path.join(CONVERSATIONS_DIR, date, `${sessionId}.json`);
}

export async function loadIndex(): Promise<ConversationSummary[]> {
  return readJsonFile<ConversationSummary[]>(INDEX_PATH, []);
}

async function saveIndex(entries: ConversationSummary[]): Promise<void> {
  await writeJsonFileAtomic(INDEX_PATH, entries);
}

function toSummary(session: ConversationSession, pinned: boolean): ConversationSummary {
  return {
    sessionId: session.sessionId,
    date: session.date,
    title: session.title,
    startTime: session.startTime,
    endTime: session.endTime,
    pinned,
    messageCount: session.messages.length,
    category: session.category,
  };
}

async function upsertIndexEntry(session: ConversationSession, pinned: boolean): Promise<void> {
  const entries = await loadIndex();
  const filtered = entries.filter((e) => e.sessionId !== session.sessionId);
  filtered.push(toSummary(session, pinned));
  await saveIndex(filtered);
}

export async function loadSession(sessionId: string): Promise<ConversationSession | null> {
  const entries = await loadIndex();
  const entry = entries.find((e) => e.sessionId === sessionId);
  if (!entry) return null;
  return readJsonFile<ConversationSession | null>(sessionPath(entry.date, sessionId), null);
}

// Creates the session (index entry + file) lazily on the first call --
// a session with zero messages is never written to disk. `category` is only
// meaningful at creation time (Phase 13's research pages tag a session with
// where it was started) and is ignored on subsequent calls for an existing
// session.
export async function appendMessage(
  sessionId: string,
  message: Omit<StoredMessage, "timestamp">,
  category?: string,
): Promise<ConversationSession> {
  let session = await loadSession(sessionId);
  const now = new Date();

  if (!session) {
    session = {
      sessionId,
      date: now.toISOString().slice(0, 10),
      startTime: now.toISOString(),
      endTime: null,
      title: FALLBACK_TITLE,
      messages: [],
      category,
    };
  }

  session.messages.push({ ...message, timestamp: now.toISOString() });
  await writeJsonFileAtomic(sessionPath(session.date, sessionId), session);

  const entries = await loadIndex();
  const existingPinned = entries.find((e) => e.sessionId === sessionId)?.pinned ?? false;
  await upsertIndexEntry(session, existingPinned);

  return session;
}

// For "Continue Report" -- appends to the LAST stored message (which must
// be the assistant message being continued) instead of pushing a new one,
// so a continued report reads as one message, not a repeated exchange.
export async function appendToLastMessage(
  sessionId: string,
  additionalContent: string,
  fields?: { sources?: StoredMessage["sources"]; confidence?: StoredMessage["confidence"]; confidenceReason?: string; truncated?: boolean },
): Promise<void> {
  const session = await loadSession(sessionId);
  if (!session) return;
  const last = session.messages[session.messages.length - 1];
  if (!last || last.role !== "assistant") return;

  last.content += additionalContent;
  if (fields?.sources !== undefined) last.sources = fields.sources;
  if (fields?.confidence !== undefined) last.confidence = fields.confidence;
  if (fields?.confidenceReason !== undefined) last.confidenceReason = fields.confidenceReason;
  last.truncated = fields?.truncated ?? false;

  await writeJsonFileAtomic(sessionPath(session.date, sessionId), session);
  const entries = await loadIndex();
  const pinned = entries.find((e) => e.sessionId === sessionId)?.pinned ?? false;
  await upsertIndexEntry(session, pinned);
}

export async function touchEndTime(sessionId: string): Promise<void> {
  const session = await loadSession(sessionId);
  if (!session) return;
  session.endTime = new Date().toISOString();
  await writeJsonFileAtomic(sessionPath(session.date, sessionId), session);
  const entries = await loadIndex();
  const pinned = entries.find((e) => e.sessionId === sessionId)?.pinned ?? false;
  await upsertIndexEntry(session, pinned);
}

export async function setPinned(sessionId: string, pinned: boolean): Promise<void> {
  const entries = await loadIndex();
  const next = entries.map((e) => (e.sessionId === sessionId ? { ...e, pinned } : e));
  await saveIndex(next);
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  const session = await loadSession(sessionId);
  if (!session) return;
  session.title = title;
  await writeJsonFileAtomic(sessionPath(session.date, sessionId), session);
  const entries = await loadIndex();
  const next = entries.map((e) => (e.sessionId === sessionId ? { ...e, title } : e));
  await saveIndex(next);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const entries = await loadIndex();
  const entry = entries.find((e) => e.sessionId === sessionId);
  if (!entry) return;
  await saveIndex(entries.filter((e) => e.sessionId !== sessionId));
  try {
    await unlink(sessionPath(entry.date, sessionId));
  } catch {
    // already gone -- fine, the index no longer references it either way
  }
}

export async function listPinned(): Promise<ConversationSummary[]> {
  const entries = await loadIndex();
  return entries.filter((e) => e.pinned).sort((a, b) => b.startTime.localeCompare(a.startTime));
}

export async function listRecent(
  limit = 8,
  excludePinned = true,
): Promise<ConversationSummary[]> {
  const entries = await loadIndex();
  return entries
    .filter((e) => !excludePinned || !e.pinned)
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, limit);
}

// "Recent searches" for a dedicated research page (Phase 13) -- real query
// against the same store, not a fabricated list.
export async function listByCategory(category: string, limit = 5): Promise<ConversationSummary[]> {
  const entries = await loadIndex();
  return entries
    .filter((e) => e.category === category)
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, limit);
}

// Resolves a set of session ids to their summaries in one index read --
// used by a research project (Phase 14) to display its linked conversations
// without a separate session-file read per conversation.
export async function getSummaries(sessionIds: string[]): Promise<ConversationSummary[]> {
  const entries = await loadIndex();
  const byId = new Map(entries.map((e) => [e.sessionId, e]));
  return sessionIds.map((id) => byId.get(id)).filter((e): e is ConversationSummary => Boolean(e));
}

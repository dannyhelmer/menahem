"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Trash2, RotateCcw, CheckSquare, Square, X } from "lucide-react";
import type { ConversationSummary } from "@/lib/memory/types";
import ConfirmDialog from "./ConfirmDialog";

export default function HistoryPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [trashed, setTrashed] = useState<ConversationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "title">("date");
  const [view, setView] = useState<"active" | "trash">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmPermanentOpen, setConfirmPermanentOpen] = useState(false);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "active") {
        const params = new URLSearchParams({ mode: "history" });
        if (search) params.set("search", search);
        if (sortBy) params.set("sortBy", sortBy);
        const res = await fetch(`/api/conversations?${params}`);
        if (res.ok) {
          const data = await res.json();
          setConversations(data.conversations ?? []);
        }
      } else {
        const res = await fetch("/api/conversations?mode=trash");
        if (res.ok) {
          const data = await res.json();
          setTrashed(data.conversations ?? []);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [view, search, sortBy]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Reset selection when switching views
  useEffect(() => {
    setSelected(new Set());
  }, [view]);

  const items = view === "active" ? conversations : trashed;

  function toggleSelect(sessionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(items.map((c) => c.sessionId)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function batchDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", sessionIds: ids }),
    });
    setConfirmDeleteOpen(false);
    setSelected(new Set());
    fetchConversations();
  }

  async function batchRestore() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", sessionIds: ids }),
    });
    setSelected(new Set());
    fetchConversations();
  }

  async function batchPermanentDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deletePermanent", sessionIds: ids }),
    });
    setConfirmPermanentOpen(false);
    setSelected(new Set());
    fetchConversations();
  }

  async function deleteSingle(sessionId: string) {
    await fetch(`/api/conversations/${sessionId}`, { method: "DELETE" });
    fetchConversations();
  }

  async function restoreSingle(sessionId: string) {
    await fetch(`/api/conversations/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    fetchConversations();
  }

  async function permanentDeleteSingle(sessionId: string) {
    await fetch(`/api/conversations/${sessionId}?permanent=true`, { method: "DELETE" });
    fetchConversations();
  }

  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <main className="flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="hover:text-burgundy mb-8 inline-block text-sm text-neutral-500 dark:text-neutral-400"
        >
          ← Back to chat
        </Link>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              Conversation History
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Search, sort, and manage all your conversations.
            </p>
          </div>
        </div>

        {/* View toggle */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setView("active")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              view === "active"
                ? "bg-burgundy text-white"
                : "border border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-300"
            }`}
          >
            All Conversations ({conversations.length})
          </button>
          <button
            onClick={() => setView("trash")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              view === "trash"
                ? "bg-burgundy text-white"
                : "border border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-300"
            }`}
          >
            Trash ({trashed.length})
          </button>
        </div>

        {/* Search and sort -- only for active view */}
        {view === "active" && (
          <div className="mb-4 flex gap-2">
            <div className="focus-within:border-burgundy/40 flex flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
              <Search className="h-4 w-4 text-neutral-400" aria-hidden="true" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full bg-transparent text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-200"
              />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Clear search">
                  <X className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                </button>
              )}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "title")}
              className="focus:border-burgundy/40 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
            >
              <option value="date">Sort by date</option>
              <option value="title">Sort by title</option>
            </select>
          </div>
        )}

        {/* Batch actions */}
        {items.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={allSelected ? selectNone : selectAll}
              className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50"
            >
              {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            {selected.size > 0 && (
              <>
                <span className="text-sm text-neutral-400">{selected.size} selected</span>
                {view === "active" ? (
                  <button
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                    Move to Trash
                  </button>
                ) : (
                  <>
                    <button
                      onClick={batchRestore}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restore
                    </button>
                    <button
                      onClick={() => setConfirmPermanentOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Permanently
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Conversation list */}
        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-400">Loading...</p>
        ) : items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-200 px-6 py-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            {view === "active"
              ? "No conversations found."
              : "Trash is empty. Deleted conversations appear here for 30 days before being permanently removed."}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((conv) => (
              <li
                key={conv.sessionId}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  selected.has(conv.sessionId)
                    ? "border-burgundy/40 bg-burgundy/5"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <button
                  onClick={() => toggleSelect(conv.sessionId)}
                  className="shrink-0 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  aria-label={selected.has(conv.sessionId) ? "Deselect" : "Select"}
                >
                  {selected.has(conv.sessionId) ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  {view === "active" ? (
                    <Link
                      href={`/c/${conv.sessionId}`}
                      className="hover:text-burgundy block truncate text-sm font-medium text-neutral-700 dark:text-neutral-200"
                    >
                      {conv.title}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      {conv.title}
                    </span>
                  )}
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">
                    {conv.date} · {conv.messageCount} message{conv.messageCount === 1 ? "" : "s"}
                    {conv.pinned && " · Pinned"}
                  </span>
                </div>
                {view === "active" ? (
                  <button
                    onClick={() => deleteSingle(conv.sessionId)}
                    className="shrink-0 rounded p-1.5 text-neutral-400 hover:text-red-600"
                    aria-label="Move to trash"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => restoreSingle(conv.sessionId)}
                      className="rounded p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      aria-label="Restore"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => permanentDeleteSingle(conv.sessionId)}
                      className="rounded p-1.5 text-neutral-400 hover:text-red-600"
                      aria-label="Delete permanently"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <ConfirmDialog
          open={confirmDeleteOpen}
          title="Move to trash?"
          message={`Move ${selected.size} conversation${selected.size === 1 ? "" : "s"} to trash? They will be permanently deleted after 30 days.`}
          onConfirm={batchDelete}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
        <ConfirmDialog
          open={confirmPermanentOpen}
          title="Delete permanently?"
          message={`Permanently delete ${selected.size} conversation${selected.size === 1 ? "" : "s"}? This cannot be undone.`}
          onConfirm={batchPermanentDelete}
          onCancel={() => setConfirmPermanentOpen(false)}
        />
      </div>
    </main>
  );
}
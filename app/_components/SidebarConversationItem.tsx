"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { useConversationsRefresh } from "./ConversationsProvider";
import { ChatBubbleIcon, PencilIcon, PinIcon, TrashIcon } from "./icons";
import type { ConversationSummary } from "@/lib/memory/types";

export default function SidebarConversationItem({
  conversation,
}: {
  conversation: ConversationSummary;
}) {
  const router = useRouter();
  const { refresh } = useConversationsRefresh();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function togglePin(event: React.MouseEvent) {
    event.stopPropagation();
    await fetch(`/api/conversations/${conversation.sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !conversation.pinned }),
    });
    refresh();
  }

  async function submitRename() {
    setRenaming(false);
    const trimmed = title.trim();
    if (!trimmed || trimmed === conversation.title) {
      setTitle(conversation.title);
      return;
    }
    await fetch(`/api/conversations/${conversation.sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    refresh();
  }

  function handleDelete(event: React.MouseEvent) {
    event.stopPropagation();
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    setConfirmOpen(false);
    await fetch(`/api/conversations/${conversation.sessionId}`, { method: "DELETE" });
    refresh();
  }

  if (renaming) {
    return (
      <li>
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={submitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setTitle(conversation.title);
              setRenaming(false);
            }
          }}
          className="focus:border-burgundy/40 w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-800 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        />
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={() => router.push(`/c/${conversation.sessionId}`)}
        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-neutral-600 transition-colors duration-150 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800/60"
      >
        {conversation.pinned ? <PinIcon /> : <ChatBubbleIcon />}
        <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
        <span className="hidden shrink-0 items-center gap-1 group-hover:flex">
          <span
            role="button"
            aria-label={conversation.pinned ? "Unpin conversation" : "Pin conversation"}
            tabIndex={0}
            onClick={togglePin}
            className="rounded p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <PinIcon />
          </span>
          <span
            role="button"
            aria-label="Rename conversation"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              setRenaming(true);
            }}
            className="rounded p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <PencilIcon />
          </span>
          <span
            role="button"
            aria-label="Delete conversation"
            tabIndex={0}
            onClick={handleDelete}
            className="rounded p-1 text-neutral-400 hover:text-red-600"
          >
            <TrashIcon />
          </span>
        </span>
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete conversation?"
        message={`Delete "${conversation.title}"? This can't be undone.`}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </li>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ConversationSummary } from "@/lib/memory/types";
import type { OwnerProfile } from "@/lib/settings/owner-profile";
import { useConversationsRefresh } from "./ConversationsProvider";
import { PlusIcon, SearchIcon, WorkspaceIcon } from "./icons";
import SidebarConversationItem from "./SidebarConversationItem";

function SidebarSection({ title, items }: { title: string; items: ConversationSummary[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <h2 className="px-2 text-xs font-medium tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
        {title}
      </h2>
      <ul className="mt-2 space-y-0.5">
        {items.map((item) => (
          <SidebarConversationItem key={item.sessionId} conversation={item} />
        ))}
      </ul>
    </div>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const { version } = useConversationsRefresh();
  const [pinned, setPinned] = useState<ConversationSummary[]>([]);
  const [recent, setRecent] = useState<ConversationSummary[]>([]);
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/conversations")
      .then((res) => res.json())
      .then((data: { pinned: ConversationSummary[]; recent: ConversationSummary[] }) => {
        setPinned(data.pinned);
        setRecent(data.recent);
      });
  }, [version]);

  useEffect(() => {
    fetch("/api/owner-profile")
      .then((res) => res.json())
      .then(setProfile);
  }, [version]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredPinned = normalizedQuery
    ? pinned.filter((c) => c.title.toLowerCase().includes(normalizedQuery))
    : pinned;
  const filteredRecent = normalizedQuery
    ? recent.filter((c) => c.title.toLowerCase().includes(normalizedQuery))
    : recent;

  return (
    <aside className="hidden w-[280px] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 md:flex dark:border-neutral-800 dark:bg-neutral-950">
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-2 px-5 pt-6 pb-5 text-left"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- avoids next/image's optimizer cache for this tiny static asset */}
        <img src="/menahem-logo.png" alt="Menahem" width={36} height={36} className="h-9 w-9" />
        <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Menahem
        </span>
      </button>

      <div className="px-4">
        <button
          onClick={() => router.push("/")}
          className="bg-burgundy hover:bg-burgundy-dark flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 active:scale-[0.98]"
        >
          <PlusIcon />
          New Chat
        </button>
      </div>

      <div className="mt-2 px-4">
        <Link
          href="/workspace"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors duration-150 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-neutral-50"
        >
          <WorkspaceIcon />
          Political Workspace
        </Link>
      </div>

      <div className="mt-4 px-4">
        <div className="focus-within:border-burgundy/40 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-neutral-400 transition-colors dark:border-neutral-800 dark:bg-neutral-900">
          <SearchIcon />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            className="w-full bg-transparent text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-200"
          />
        </div>
      </div>

      <nav className="mt-6 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
        <SidebarSection title="Pinned" items={filteredPinned} />
        <SidebarSection title="Recent" items={filteredRecent} />
      </nav>

      <div className="border-t border-neutral-200 px-3 py-3 dark:border-neutral-800">
        <Link
          href="/settings"
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60"
        >
          <div className="bg-burgundy/10 text-burgundy dark:bg-burgundy/20 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
            {(profile?.preferredName ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {profile?.preferredName ?? "…"}
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">Settings</span>
          </div>
        </Link>
      </div>
    </aside>
  );
}

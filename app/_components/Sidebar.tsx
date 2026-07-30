"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ConversationSummary } from "@/lib/memory/types";
import type { OwnerProfile } from "@/lib/settings/owner-profile";
import AccountMenu from "./AccountMenu";
import { useConversationsRefresh } from "./ConversationsProvider";
import { AdminIcon, CloseIcon, MenuIcon, PlusIcon, SearchIcon, WorkspaceIcon } from "./icons";
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

// The actual nav content -- identical whether it's rendered in the
// always-visible desktop <aside> or inside the mobile slide-out drawer, so
// mobile is never missing anything the desktop sidebar has. `onNavigate` is
// called whenever the user picks something that leaves this screen (New
// Chat, Political Workspace, Admin, a conversation) so the mobile drawer
// can close itself -- desktop passes a no-op since there's no drawer to close.
function SidebarContent({
  onNavigate,
  isAdmin,
  email,
  profile,
  pinned,
  recent,
  query,
  onQueryChange,
}: {
  onNavigate: () => void;
  isAdmin: boolean;
  email: string | null;
  profile: OwnerProfile | null;
  pinned: ConversationSummary[];
  recent: ConversationSummary[];
  query: string;
  onQueryChange: (value: string) => void;
}) {
  // Sending a message from "/" updates the URL bar to /c/<id> via a raw
  // history.replaceState (useChatSession.ts) rather than a real Next.js
  // navigation -- deliberately, so the in-progress streaming reply isn't
  // interrupted by a route change/remount. The tradeoff: Next's client
  // router never learns the route actually changed, so it still believes
  // the current route is "/". A subsequent router.push("/") then looks
  // like a no-op navigation to Next (already "there"), which is exactly
  // the reported bug -- New Chat silently doing nothing until enough
  // clicks/navigations desync-and-resync the router by accident. A full
  // reload sidesteps that entirely and guarantees a genuinely empty chat
  // every time, which is what "New Chat" should always do anyway.
  function startNewChat() {
    window.location.href = "/";
  }

  return (
    <>
      <button
        onClick={startNewChat}
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
          onClick={startNewChat}
          className="bg-burgundy hover:bg-burgundy-dark flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 active:scale-[0.98]"
        >
          <PlusIcon />
          New Chat
        </button>
      </div>

      <div className="mt-2 px-4">
        <Link
          href="/workspace"
          onClick={onNavigate}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors duration-150 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-neutral-50"
        >
          <WorkspaceIcon />
          Political Workspace
        </Link>
      </div>

      {isAdmin && (
        <div className="mt-2 px-4">
          <Link
            href="/admin"
            onClick={onNavigate}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors duration-150 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-neutral-50"
          >
            <AdminIcon />
            Admin
          </Link>
        </div>
      )}

      <div className="mt-4 px-4">
        <div className="focus-within:border-burgundy/40 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-neutral-400 transition-colors dark:border-neutral-800 dark:bg-neutral-900">
          <SearchIcon />
          <input
            type="text"
            name="conversation-search"
            // Chrome's "Addresses and more" autofill (name/email/phone)
            // ignores plain autoComplete="off" on ordinary text inputs --
            // "new-password" is the documented, reliable way to make Chrome
            // treat a field as genuinely not-autofillable regardless of type.
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search conversations"
            className="w-full bg-transparent text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-200"
          />
        </div>
      </div>

      <nav className="mt-6 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
        <SidebarSection title="Pinned" items={pinned} />
        <SidebarSection title="Recent" items={recent} />
      </nav>

      <div className="border-t border-neutral-200 px-3 py-3 dark:border-neutral-800">
        <AccountMenu profile={profile} email={email} />
      </div>
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { version } = useConversationsRefresh();
  const [pinned, setPinned] = useState<ConversationSummary[]>([]);
  const [recent, setRecent] = useState<ConversationSummary[]>([]);
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

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

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: { user: { email: string; isAdmin: boolean } | null }) => {
        setIsAdmin(data.user?.isAdmin ?? false);
        setEmail(data.user?.email ?? null);
      });
  }, []);

  // Catch-all close whenever the route actually changes -- covers
  // navigations triggered by a plain router.push (SidebarConversationItem's
  // "open this conversation" button isn't a <Link>, so it has no onClick
  // we control from here) in addition to the explicit onNavigate calls on
  // the Links/buttons above.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Body scroll is locked while the drawer is open (standard mobile-drawer
  // behavior) -- purely a CSS/scroll concern, doesn't touch the current
  // conversation's state at all, so whatever's open behind the drawer is
  // untouched when it closes.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredPinned = normalizedQuery
    ? pinned.filter((c) => c.title.toLowerCase().includes(normalizedQuery))
    : pinned;
  const filteredRecent = normalizedQuery
    ? recent.filter((c) => c.title.toLowerCase().includes(normalizedQuery))
    : recent;

  return (
    <>
      {/* Mobile-only top bar -- fixed so it never depends on the parent
          layout's flex direction, and always reachable regardless of scroll
          position within whatever page is currently rendered. */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-4 md:hidden dark:border-neutral-800 dark:bg-neutral-950">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          <MenuIcon />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/menahem-logo.png" alt="Menahem" width={24} height={24} className="h-6 w-6" />
        <span className="text-base font-semibold text-neutral-900 dark:text-neutral-50">Menahem</span>
      </header>

      {/* Desktop sidebar -- unchanged behavior, always visible at md+. */}
      <aside className="hidden w-[280px] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 md:flex dark:border-neutral-800 dark:bg-neutral-950">
        <SidebarContent
          onNavigate={() => {}}
          isAdmin={isAdmin}
          email={email}
          profile={profile}
          pinned={filteredPinned}
          recent={filteredRecent}
          query={query}
          onQueryChange={setQuery}
        />
      </aside>

      {/* Mobile drawer -- fixed overlay, only ever rendered on top of
          whatever page/conversation is already mounted underneath, so
          opening/closing it never remounts or resets the current chat. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative flex h-full w-[85%] max-w-[320px] flex-col bg-neutral-50 shadow-xl dark:bg-neutral-950">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute top-4 right-3 flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            >
              <CloseIcon />
            </button>
            <SidebarContent
              onNavigate={() => setMobileOpen(false)}
              isAdmin={isAdmin}
              email={email}
              profile={profile}
              pinned={filteredPinned}
              recent={filteredRecent}
              query={query}
              onQueryChange={setQuery}
            />
          </div>
        </div>
      )}
    </>
  );
}

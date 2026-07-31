"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { OwnerProfile } from "@/lib/settings/owner-profile";
import { ChevronRightIcon, HelpIcon, PricingIcon, SettingsIcon, SignOutIcon } from "./icons";

const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 transition-colors duration-150 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800";

export default function AccountMenu({
  profile,
  email,
}: {
  profile: OwnerProfile | null;
  email: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/signin");
    router.refresh();
  }

  return (
    <div className="relative" ref={containerRef}>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-60 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          {email && (
            <div className="mb-1 truncate border-b border-neutral-100 px-3 pb-2 text-xs text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
              {email}
            </div>
          )}

          <Link href="/settings" onClick={() => setOpen(false)} className={menuItemClass}>
            <SettingsIcon />
            Settings
          </Link>

          <Link href="/pricing" onClick={() => setOpen(false)} className={menuItemClass}>
            <PricingIcon />
            Pricing
          </Link>

          <div className="group relative">
            <button type="button" className={`${menuItemClass} justify-between`}>
              <span className="flex items-center gap-2.5">
                <HelpIcon />
                Learn more
              </span>
              <ChevronRightIcon />
            </button>
            <div className="invisible absolute bottom-0 left-full ml-1 w-48 rounded-xl border border-neutral-200 bg-white p-1.5 opacity-0 shadow-lg transition-opacity duration-100 group-hover:visible group-hover:opacity-100 dark:border-neutral-800 dark:bg-neutral-900">
              <Link href="/privacy" onClick={() => setOpen(false)} className={menuItemClass}>
                Privacy Policy
              </Link>
              <Link href="/terms" onClick={() => setOpen(false)} className={menuItemClass}>
                Terms of Service
              </Link>
            </div>
          </div>

          <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />

          <button
            type="button"
            onClick={handleSignOut}
            className={`${menuItemClass} text-red-600 dark:text-red-400`}
          >
            <SignOutIcon />
            Log out
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
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
      </button>
    </div>
  );
}

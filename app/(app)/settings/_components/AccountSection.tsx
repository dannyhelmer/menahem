"use client";

import { useState } from "react";
import type { OwnerProfile } from "@/lib/settings/owner-profile";

export default function AccountSection({ initialProfile }: { initialProfile: OwnerProfile }) {
  const [name, setName] = useState(initialProfile.name);
  const [preferredName, setPreferredName] = useState(initialProfile.preferredName);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch("/api/owner-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, preferredName }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Full name
        </label>
        <input
          id="name"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="focus:border-burgundy/50 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="preferredName"
          className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Preferred name
        </label>
        <input
          id="preferredName"
          autoComplete="off"
          value={preferredName}
          onChange={(event) => setPreferredName(event.target.value)}
          className="focus:border-burgundy/50 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        />
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          This is what Menahem calls you.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-burgundy hover:bg-burgundy-dark rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors duration-150 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-neutral-500 dark:text-neutral-400">Saved</span>}
      </div>
    </form>
  );
}

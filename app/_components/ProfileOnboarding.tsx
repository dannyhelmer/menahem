"use client";

import { useState } from "react";

// Shown once, right after signup/first login, when the account has never
// had a name set (see (app)/layout.tsx -- `!user.preferredName`). Saves
// through the exact same /api/owner-profile endpoint Settings > Account
// already uses, so there's only one place that ever writes this data.
export default function ProfileOnboarding() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst || saving) return;

    setSaving(true);
    const name = lastName.trim() ? `${trimmedFirst} ${lastName.trim()}` : trimmedFirst;
    await fetch("/api/owner-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, preferredName: preferredName.trim() || trimmedFirst }),
    });
    setDismissed(true);
  }

  const inputClassName =
    "focus:border-burgundy/50 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Welcome to Menahem</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          What should we call you?
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="firstName" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              First name
            </label>
            <input
              id="firstName"
              autoFocus
              required
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lastName" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Last name <span className="text-neutral-400 dark:text-neutral-500">(optional)</span>
            </label>
            <input
              id="lastName"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="preferredName" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Preferred name <span className="text-neutral-400 dark:text-neutral-500">(optional)</span>
            </label>
            <input
              id="preferredName"
              placeholder={firstName.trim() || "What Menahem calls you"}
              value={preferredName}
              onChange={(event) => setPreferredName(event.target.value)}
              className={inputClassName}
            />
          </div>

          <button
            type="submit"
            disabled={!firstName.trim() || saving}
            className="bg-burgundy hover:bg-burgundy-dark w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Continue"}
          </button>
          <p className="text-center text-xs text-neutral-400 dark:text-neutral-500">
            You can change this anytime in Settings.
          </p>
        </form>
      </div>
    </div>
  );
}

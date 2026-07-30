"use client";

import { useEffect, useState } from "react";

interface KeyStatus {
  configured: boolean;
  masked: string | null;
}

function ProviderKeyRow({ providerId, label }: { providerId: string; label: string }) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/settings/api-keys/${providerId}`)
      .then((res) => res.json())
      .then(setStatus);
  }, [providerId]);

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/settings/api-keys/${providerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    setStatus(await res.json());
    setValue("");
    setSaving(false);
  }

  async function handleClear() {
    setSaving(true);
    const res = await fetch(`/api/settings/api-keys/${providerId}`, { method: "DELETE" });
    setStatus(await res.json());
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-44 shrink-0 text-sm text-neutral-700 dark:text-neutral-300">{label}</div>
      {status?.configured ? (
        <>
          <span className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            {status.masked}
          </span>
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="shrink-0 rounded-xl px-3 py-2 text-sm text-neutral-500 hover:text-red-600 disabled:opacity-50"
          >
            Clear
          </button>
        </>
      ) : (
        <>
          <input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste API key"
            className="focus:border-burgundy/50 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="bg-burgundy hover:bg-burgundy-dark shrink-0 rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors duration-150 disabled:opacity-50"
          >
            Save
          </button>
        </>
      )}
    </div>
  );
}

export default function SearchProvidersSection() {
  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Add your own API key for any provider you want Menahem to search with. None of these are
        required to use Menahem, but web search stays unavailable until at least one is configured.
      </p>
      <ProviderKeyRow providerId="brave" label="Brave Search" />
      <ProviderKeyRow providerId="tavily" label="Tavily" />
      <ProviderKeyRow providerId="google" label="Google API Key" />
      <ProviderKeyRow providerId="google_cx" label="Google Search Engine ID" />
      <ProviderKeyRow providerId="serpapi" label="SerpAPI" />
    </div>
  );
}

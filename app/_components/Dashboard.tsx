"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GraphEntity } from "@/lib/graph/types";
import { humanize } from "@/lib/graph/humanize";
import ChatDisclaimer from "./ChatDisclaimer";
import PromptInput from "./PromptInput";

const RECENT_ENTITY_TYPE_LABELS: Record<string, string> = {
  bill: "Bill",
  representative: "Representative",
  candidate: "Candidate",
  budget: "Budget",
  court: "Court Case",
};

const EXAMPLE_PROMPTS = [
  "What executive orders has the current administration signed this month?",
  "Summarize the latest Supreme Court decisions.",
  "Compare the tax policies of the major parties.",
  "What are the biggest political stories today?",
  "Explain the conflict in the South China Sea.",
  "Track the progress of a bill through Congress.",
  "Who has announced a campaign for the 2028 presidential election?",
  "Compare the budgets of all 50 states.",
  "How does the Electoral College work?",
  "Summarize the latest developments in U.S.–China relations.",
  "What are the major issues in the upcoming election?",
  "Explain NATO's role in Europe.",
];

const EXAMPLE_ROTATION_MS = 4000;

export default function Dashboard({
  draft,
  onChange,
  onSubmit,
  webSearchEnabled,
  onToggleWebSearch,
  deepResearchEnabled,
  onToggleDeepResearch,
  onUploadDocument,
  attachedDocument,
  onClearAttachedDocument,
  recentEntities,
}: {
  draft: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  webSearchEnabled: boolean;
  onToggleWebSearch: () => void;
  deepResearchEnabled: boolean;
  onToggleDeepResearch: () => void;
  onUploadDocument: (file: File) => void;
  attachedDocument: { filename: string; status: "uploading" | "ready" | "error" } | null;
  onClearAttachedDocument: () => void;
  recentEntities: GraphEntity[];
}) {
  // Starts at a fixed index so the server-rendered and first client render
  // match (no hydration mismatch), then jumps to a random example right
  // after mount and keeps picking a new random one (never repeating the
  // last) on each rotation tick.
  const [exampleIndex, setExampleIndex] = useState(0);

  useEffect(() => {
    function pickNext(current: number) {
      if (EXAMPLE_PROMPTS.length <= 1) return current;
      let next = current;
      while (next === current) next = Math.floor(Math.random() * EXAMPLE_PROMPTS.length);
      return next;
    }

    setExampleIndex((current) => pickNext(current));
    const interval = setInterval(() => setExampleIndex((current) => pickNext(current)), EXAMPLE_ROTATION_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-10">
        <div className="space-y-3 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl dark:text-neutral-50">
            Government Intelligence Platform
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-neutral-500 dark:text-neutral-400">
            AI-powered research for legislation, public policy, and official government sources.
          </p>
        </div>

        <div className="w-full max-w-3xl space-y-3">
          <PromptInput
            value={draft}
            onChange={onChange}
            onSubmit={onSubmit}
            webSearchEnabled={webSearchEnabled}
            onToggleWebSearch={onToggleWebSearch}
            deepResearchEnabled={deepResearchEnabled}
            onToggleDeepResearch={onToggleDeepResearch}
            onUploadDocument={onUploadDocument}
            attachedDocument={attachedDocument}
            onClearAttachedDocument={onClearAttachedDocument}
          />
          <ChatDisclaimer />
          {draft.trim().length === 0 && (
            <div className="flex items-center justify-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
              <span>Try asking:</span>
              <button
                onClick={() => onChange(EXAMPLE_PROMPTS[exampleIndex])}
                className="hover:border-burgundy/40 hover:bg-burgundy/5 dark:hover:bg-burgundy/10 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 transition-colors duration-150 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
              >
                {EXAMPLE_PROMPTS[exampleIndex]}
              </button>
            </div>
          )}
        </div>

        {recentEntities.length > 0 && (
          <section className="w-full">
            <h2 className="mb-4 text-sm font-medium tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
              Recent Research
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {recentEntities.map((entity) => (
                <li key={entity.id}>
                  <Link
                    href={`/workspace/${encodeURIComponent(entity.id)}`}
                    className="hover:border-burgundy/40 flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 transition-colors dark:border-neutral-800 dark:text-neutral-200"
                  >
                    <span className="truncate">{entity.label}</span>
                    <span className="ml-3 shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                      {RECENT_ENTITY_TYPE_LABELS[entity.type] ?? humanize(entity.type)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

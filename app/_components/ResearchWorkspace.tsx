"use client";

import { useState } from "react";
import Link from "next/link";
import type { ConversationSummary } from "@/lib/memory/types";
import type { ResearchCategoryConfig } from "@/lib/research-categories/config";
import ChatDisclaimer from "./ChatDisclaimer";
import ConversationThread from "./ConversationThread";
import PromptInput from "./PromptInput";
import { RESEARCH_CATEGORY_ICONS } from "./research-category-icons";
import { useChatSession } from "./useChatSession";

export default function ResearchWorkspace({
  category,
  recentSearches,
}: {
  category: ResearchCategoryConfig;
  recentSearches: ConversationSummary[];
}) {
  const [draft, setDraft] = useState("");
  const {
    messages,
    status,
    webSearchEnabled,
    toggleWebSearch,
    deepResearchEnabled,
    toggleDeepResearch,
    sendMessage,
    continueMessage,
    retryWithDeepResearch,
  } = useChatSession({ category: category.slug });

  const Icon = RESEARCH_CATEGORY_ICONS[category.slug];

  function handleSubmit() {
    sendMessage(draft);
    setDraft("");
  }

  if (messages.length > 0) {
    return (
      <ConversationThread
        messages={messages}
        streaming={status === "streaming"}
        draft={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        onSelectFollowup={sendMessage}
        onContinue={continueMessage}
        onDeepResearch={retryWithDeepResearch}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={toggleWebSearch}
        deepResearchEnabled={deepResearchEnabled}
        onToggleDeepResearch={toggleDeepResearch}
      />
    );
  }

  return (
    <main className="flex-1 overflow-y-auto px-6 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
        <Link
          href="/"
          className="hover:text-burgundy -mb-4 text-sm text-neutral-500 dark:text-neutral-400"
        >
          ← Back to dashboard
        </Link>

        <div className="space-y-3">
          <div className="bg-burgundy/10 text-burgundy dark:bg-burgundy/20 flex h-12 w-12 items-center justify-center rounded-2xl">
            {Icon && <Icon className="h-6 w-6" aria-hidden="true" />}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {category.title}
          </h1>
          <p className="text-lg text-neutral-500 dark:text-neutral-400">{category.description}</p>
        </div>

        <div className="space-y-3">
          <PromptInput
            value={draft}
            onChange={setDraft}
            onSubmit={handleSubmit}
            webSearchEnabled={webSearchEnabled}
            onToggleWebSearch={toggleWebSearch}
            deepResearchEnabled={deepResearchEnabled}
            onToggleDeepResearch={toggleDeepResearch}
          />
          <ChatDisclaimer />
        </div>

        <section>
          <h2 className="mb-3 text-sm font-medium tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
            Suggested Searches
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {category.exampleSearches.map((example) => (
              <button
                key={example}
                onClick={() => sendMessage(example)}
                className="hover:border-burgundy/40 hover:bg-burgundy/5 dark:hover:bg-burgundy/10 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm text-neutral-600 transition-colors duration-150 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
              >
                {example}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
            Recent Searches
          </h2>
          {recentSearches.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-200 px-6 py-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              No {category.title.toLowerCase()} searches yet. Start one above and it will show up here.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recentSearches.map((search) => (
                <li key={search.sessionId}>
                  <Link
                    href={`/c/${search.sessionId}`}
                    className="hover:border-burgundy/40 block truncate rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-neutral-700 transition-colors dark:border-neutral-800 dark:text-neutral-200"
                  >
                    {search.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

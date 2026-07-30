"use client";

import { useEffect, useRef } from "react";
import { FlaskIcon, GlobeIcon, SendIcon } from "./icons";

const MAX_TEXTAREA_HEIGHT = 200;

export default function PromptInput({
  value,
  onChange,
  onSubmit,
  disabled,
  webSearchEnabled,
  onToggleWebSearch,
  deepResearchEnabled,
  onToggleDeepResearch,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  webSearchEnabled: boolean;
  onToggleWebSearch: () => void;
  deepResearchEnabled: boolean;
  onToggleDeepResearch: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  const canSubmit = value.trim().length > 0 && !disabled;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSubmit) onSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="focus-within:border-burgundy/50 rounded-3xl border border-neutral-200 bg-white p-3 pl-5 shadow-sm transition-shadow duration-150 focus-within:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleWebSearch}
            aria-pressed={webSearchEnabled}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
              webSearchEnabled
                ? "bg-burgundy/10 text-burgundy dark:bg-burgundy/20"
                : "text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <GlobeIcon />
            Web Search
          </button>
          <button
            type="button"
            onClick={onToggleDeepResearch}
            aria-pressed={deepResearchEnabled}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
              deepResearchEnabled
                ? "bg-burgundy/10 text-burgundy dark:bg-burgundy/20"
                : "text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <FlaskIcon />
            Deep Research
          </button>
        </div>
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Menahem anything…"
            className="max-h-[200px] flex-1 resize-none bg-transparent py-2.5 text-base text-neutral-800 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-100"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!canSubmit}
            className="bg-burgundy hover:bg-burgundy-dark flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-all duration-150 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </form>
  );
}

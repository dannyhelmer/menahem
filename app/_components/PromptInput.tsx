"use client";

import { useEffect, useRef } from "react";
import type { AttachedDocumentState } from "./chat-types";
import { AttachIcon, CloseIcon, FlaskIcon, GlobeIcon, SendIcon } from "./icons";

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
  onUploadDocument,
  attachedDocument,
  onClearAttachedDocument,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  webSearchEnabled: boolean;
  onToggleWebSearch: () => void;
  deepResearchEnabled: boolean;
  onToggleDeepResearch: () => void;
  onUploadDocument?: (file: File) => void;
  attachedDocument?: AttachedDocumentState | null;
  onClearAttachedDocument?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (file) onUploadDocument?.(file);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="focus-within:border-burgundy/50 rounded-3xl border border-neutral-200 bg-white p-3 pl-5 shadow-sm transition-shadow duration-150 focus-within:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {onUploadDocument && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.docx,.txt,.md,application/pdf"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach a document"
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-neutral-400 transition-colors duration-150 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <AttachIcon />
              </button>
            </>
          )}
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

        {attachedDocument && (
          <div
            className={`mb-1.5 flex items-center gap-2 self-start rounded-2xl border py-1 pr-1 pl-3 text-xs ${
              attachedDocument.status === "error"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
                : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            <span className="max-w-[320px]">
              {attachedDocument.status === "uploading" && <span className="truncate">Uploading {attachedDocument.filename}</span>}
              {attachedDocument.status === "ready" && <span className="truncate">{attachedDocument.filename}</span>}
              {attachedDocument.status === "error" && (
                <>
                  <span className="block truncate font-medium">Couldn't attach {attachedDocument.filename}</span>
                  {attachedDocument.errorMessage && (
                    <span className="block text-red-600 dark:text-red-400">{attachedDocument.errorMessage}</span>
                  )}
                </>
              )}
            </span>
            <button
              type="button"
              onClick={onClearAttachedDocument}
              aria-label="Remove attached document"
              className="self-start rounded-full p-0.5 text-neutral-400 hover:text-red-600"
            >
              <CloseIcon />
            </button>
          </div>
        )}

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
            className="bg-burgundy hover:bg-burgundy-dark flex h-10 w-10 shrink-0 grow-0 items-center justify-center rounded-full text-white transition-all duration-150 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </form>
  );
}

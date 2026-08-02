"use client";

import { useState } from "react";
import { LinkIcon } from "./icons";
import Markdown from "./Markdown";
import type { UiMessage } from "./chat-types";

const CONFIDENCE_LABEL: Record<NonNullable<UiMessage["confidence"]>, string> = {
  high: "Evidence Strength: High",
  medium: "Evidence Strength: Medium",
  low: "Evidence Strength: Low",
};

const CONFIDENCE_DOT_CLASS: Record<NonNullable<UiMessage["confidence"]>, string> = {
  high: "bg-green-500",
  medium: "bg-amber-500",
  low: "bg-neutral-400",
};

// Its own step in the reading flow (Answer -> Evidence Strength -> Sources
// -> Related Questions), not a footnote squeezed into the Sources header --
// "why is this Medium?" still gets a real, mechanical answer (source
// counts/composition) on click, it just isn't fighting the Sources label
// for the same row anymore.
function EvidenceStrength({
  confidence,
  reason,
}: {
  confidence: NonNullable<UiMessage["confidence"]>;
  reason?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      {reason ? (
        <button
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400"
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CONFIDENCE_DOT_CLASS[confidence]}`} aria-hidden="true" />
          <span className="hover:text-burgundy underline decoration-dotted underline-offset-2">
            {CONFIDENCE_LABEL[confidence]}
          </span>
        </button>
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CONFIDENCE_DOT_CLASS[confidence]}`} aria-hidden="true" />
          {CONFIDENCE_LABEL[confidence]}
        </span>
      )}
      {open && reason && (
        <p className="mt-1.5 max-w-[320px] text-xs whitespace-pre-line text-neutral-500 dark:text-neutral-400">
          {reason}
        </p>
      )}
    </div>
  );
}

function SourcesList({
  sources,
  needsOwnSeparator,
}: {
  sources: { title: string; url: string }[];
  needsOwnSeparator: boolean;
}) {
  return (
    <div className={needsOwnSeparator ? "mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800" : "mt-3"}>
      <p className="mb-1.5 text-xs font-medium tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
        Sources
      </p>
      <ul className="space-y-1">
        {sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-burgundy flex w-full min-w-0 items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400"
            >
              <LinkIcon />
              <span className="min-w-0 flex-1 truncate">{source.title || source.url}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FollowupChips({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          className="hover:border-burgundy/40 hover:bg-burgundy/5 dark:hover:bg-burgundy/10 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 transition-colors duration-150 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

// Copies the full formatted response -- not just the raw markdown text, but
// the same Sources/Confidence info rendered separately in the UI -- so
// pasting it elsewhere doesn't silently drop the citations or confidence
// rationale that only exist as structured fields on the message.
function buildCopyText(message: UiMessage): string {
  const parts = [message.content];

  if (message.sources && message.sources.length > 0) {
    const lines = message.sources.map((s) => `- ${s.title || s.url}: ${s.url}`);
    parts.push(`Sources:\n${lines.join("\n")}`);
  }

  if (message.confidence) {
    const label = CONFIDENCE_LABEL[message.confidence];
    parts.push(message.confidenceReason ? `${label} -- ${message.confidenceReason}` : label);
  }

  return parts.join("\n\n");
}

function CopyResponseButton({ message }: { message: UiMessage }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildCopyText(message));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable/denied -- nothing sensible to do but not crash.
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="hover:border-burgundy/40 hover:text-burgundy mt-3 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 transition-colors dark:border-neutral-800 dark:text-neutral-400"
    >
      {copied ? "Copied!" : "Copy Response"}
    </button>
  );
}

function TruncatedNotice({
  onContinue,
  onDeepResearch,
}: {
  onContinue: () => void;
  onDeepResearch: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        This report has been summarized for readability. Continue this report for additional analysis, or use
        Deep Research for a comprehensive report with expanded sources and citations.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onContinue}
          className="bg-burgundy hover:bg-burgundy-dark rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150"
        >
          Continue Report
        </button>
        <button
          onClick={onDeepResearch}
          className="hover:border-burgundy/40 hover:text-burgundy rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors dark:border-neutral-700 dark:text-neutral-300"
        >
          Deep Research
        </button>
      </div>
    </div>
  );
}

export default function MessageBubble({
  message,
  onSelectFollowup,
  onContinue,
  onDeepResearch,
}: {
  message: UiMessage;
  onSelectFollowup: (text: string) => void;
  onContinue: (assistantId: string) => void;
  onDeepResearch: (assistantId: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        {message.attachedFilename && (
          <span className="flex max-w-[85%] min-w-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            <LinkIcon />
            <span className="min-w-0 truncate">{message.attachedFilename}</span>
          </span>
        )}
        <div className="bg-burgundy/10 dark:bg-burgundy/20 max-w-[85%] min-w-0 rounded-2xl px-4 py-2.5 text-[15px] break-words text-neutral-800 dark:text-neutral-100">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="min-w-0 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[15px] break-words text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
        {message.content || "Something went wrong."}
      </div>
    );
  }

  return (
    <div className="max-w-[85%] min-w-0 text-[15px] break-words text-neutral-800 dark:text-neutral-100">
      <Markdown content={message.content} />
      {message.confidence && (
        <EvidenceStrength confidence={message.confidence} reason={message.confidenceReason} />
      )}
      {message.sources && message.sources.length > 0 && (
        <SourcesList sources={message.sources} needsOwnSeparator={!message.confidence} />
      )}
      {message.followups && message.followups.length > 0 && (
        <FollowupChips suggestions={message.followups} onSelect={onSelectFollowup} />
      )}
      {message.truncated && (
        <TruncatedNotice
          onContinue={() => onContinue(message.id)}
          onDeepResearch={() => onDeepResearch(message.id)}
        />
      )}
      {message.content.length > 0 && <CopyResponseButton message={message} />}
    </div>
  );
}

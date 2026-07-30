"use client";

const prompts = [
  "Summarize this week's research papers",
  "Draft a literature review outline",
  "Compare two competing theories",
  "Brainstorm new research questions",
];

export default function SuggestedPrompts({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          onClick={() => onSelect(prompt)}
          className="hover:border-burgundy/40 hover:bg-burgundy/5 dark:hover:bg-burgundy/10 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm text-neutral-600 transition-colors duration-150 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

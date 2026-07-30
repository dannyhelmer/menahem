// Single-shot message classification driving the "thinking" indicator label
// -- ported from the Python app's tools/task_classifier.py. Math and web
// search are decided separately (see math-tool.ts/web-search-intent.ts,
// checked before this runs) since they need real evaluation/detection, not
// just pattern-matching. Categories this app can't reach yet (vision/file/
// congress/historical) are omitted entirely rather than stubbed -- they'll
// be added back exactly when the phase that implements them lands.
export type TaskCategory = "comparison" | "coding" | "creative" | "planning" | "reasoning" | "generic";

const CODING_RE =
  /\b(write|fix|debug|refactor)\s+(a |the |this |my )?(function|script|program|code|class|method|bug|algorithm)\b|\b(python|javascript|typescript|java|c\+\+|c#|golang|rust|sql|html|css|regex|api)\b|```/i;

const CREATIVE_RE = /\b(write|compose)\s+(a |the |me a )?(poem|story|song|script|lyrics|essay|speech)\b/i;

const PLANNING_RE =
  /\b(make|help me make|build|create|help me build)\s+a\s+plan\b|\bhelp me plan\b|\bschedule\b|\borganize (my|a)\b|\bsteps to\b|\broadmap\b|\bto-?do list\b|\bitinerary\b/i;

const COMPARISON_RE = /\bcompare\b|\bdifference between\b|\bvs\.?\b|\bversus\b|\bwhich is better\b|\bpros and cons\b/i;

const REASONING_RE =
  /\bphilosoph(y|ical)\b|\bethic(s|al)?\b|\bmoral(ity|ly)?\b|\bis it (right|wrong|okay|justified|ethical|moral)\b|\bshould (i|we|society|people)\b|\butilitarian|deontolog|virtue ethics|categorical imperative|natural law|social contract\b/i;

export function classify(text: string): TaskCategory {
  if (COMPARISON_RE.test(text)) return "comparison";
  if (CODING_RE.test(text)) return "coding";
  if (CREATIVE_RE.test(text)) return "creative";
  if (PLANNING_RE.test(text)) return "planning";
  if (REASONING_RE.test(text)) return "reasoning";
  return "generic";
}

export const CATEGORY_LABELS: Record<TaskCategory | "math" | "fast_path" | "web_search", string> = {
  fast_path: "Replying",
  math: "Calculating",
  web_search: "Searching the web",
  comparison: "Comparing",
  coding: "Writing code",
  creative: "Writing",
  planning: "Planning",
  reasoning: "Reasoning",
  generic: "Thinking",
};

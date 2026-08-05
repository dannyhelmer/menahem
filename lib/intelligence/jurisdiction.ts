// Ported from the Python app's tools/political_research: which level of
// government a question is actually about, and which state if any.
import { STATE_NAME_TO_CODE } from "@/lib/data/us-states";
import type { PoliticalIntent } from "@/lib/intelligence/political-intent";

export type Jurisdiction = "federal" | "state" | "local";

export const LOCAL_LEVEL_RE =
  /\b(city council|county commissioner\w*|county board|school board|park district|municipal\w*|mayor\w*|county clerk|county election\w*|local election\w*|town council|village board|city government|township trustee\w*|planning commission\w*|ordinance\w*|zoning\w*)\b/i;

const STATE_LEVEL_RE =
  /\b(governors?|state senate|state house|state legislature|secretary of state|state attorney general|state court\w*|state supreme court|state campaign finance|state ethics commission|state representative\w*|state senator\w*)\b/i;

const STATE_NAME_RE = new RegExp(
  `\\b(${Object.keys(STATE_NAME_TO_CODE)
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})\\b`,
  "i",
);

export function detectJurisdiction(text: string): Jurisdiction {
  if (LOCAL_LEVEL_RE.test(text)) return "local";
  if (STATE_LEVEL_RE.test(text)) return "state";
  return "federal";
}

export function detectState(text: string): string | null {
  const match = text.match(STATE_NAME_RE);
  if (!match) return null;
  return match[1].replace(/\b\w/g, (c) => c.toUpperCase());
}

// Combines jurisdiction/state detection with one override: a state bill
// mentioned without an obvious state-level keyword (detectJurisdiction alone
// would call it "federal") but that DOES name a state explicitly really does
// mean state jurisdiction -- correct that one case without loosening
// jurisdiction detection for everything else (a federal bill that happens to
// mention a state for unrelated reasons should stay federal). Callers that
// decompose one question into independent subtasks (each naming its own
// state) must call this PER SUBTASK, not once for the whole original
// question -- reusing a single outer resolution across subtasks about
// different states is exactly the bug this function's per-call granularity
// exists to avoid.
export function resolveJurisdictionAndState(
  text: string,
  intents: Set<PoliticalIntent>,
): { jurisdiction: Jurisdiction; state: string | null } {
  const jurisdiction = detectJurisdiction(text);
  if (jurisdiction === "federal" && intents.has("state_legislation")) {
    const state = detectState(text);
    if (state) return { jurisdiction: "state", state };
  }
  return { jurisdiction, state: jurisdiction === "federal" ? null : detectState(text) };
}

// A bare state-shaped bill number ("HB 312", "Senate Bill 10") with no state
// named is genuinely ambiguous -- every state numbers its bills starting
// from 1, so guessing which state's HB 312 the user means would be exactly
// the kind of unverified guess this project's anti-fabrication discipline
// avoids everywhere else. Matches today's actual two-jurisdiction capability
// (see lib/jurisdictions/options.ts) -- not a promise of all 50 states.
export const JURISDICTION_CLARIFICATION_MESSAGE = "Which jurisdiction do you mean? Illinois or Federal?";

export const LOCAL_JURISDICTION_CLARIFICATION_MESSAGE = "Which city or municipality do you mean?";

// A bare local-office mention ("mayor," "city council") with no place named
// is genuinely ambiguous -- there are thousands of mayors. Relying on the
// model to reliably ask a clarifying question here (rather than answering
// generically) turned out not to be reliable in practice, even with an
// explicit prompt instruction -- this is the same deterministic-gate
// pattern already used for a bare state bill number, applied here instead
// of trusting instruction-following alone.
const PLACE_BEFORE_OFFICE_RE = /\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?\s+(?:mayor|city council)\b/;
const PLACE_AFTER_OFFICE_RE = /\b(?:mayor|city council)(?:\s+(?:race|election|seat))?\s+(?:of|in|for)\s+[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?\b/i;

export function hasLocalPlaceHint(text: string): boolean {
  return Boolean(detectState(text)) || PLACE_BEFORE_OFFICE_RE.test(text) || PLACE_AFTER_OFFICE_RE.test(text);
}

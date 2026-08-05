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

// A state name paired with an unambiguous state-government-branch noun
// (legislature, general assembly, attorney general, governor, state court,
// or an HB/SB-style state bill number) is state jurisdiction even when the
// text never uses the literal word "state" -- "the Texas legislature" and
// "the Illinois Attorney General" are exactly as state-specific as "the
// state legislature", they just name the state instead of saying "state".
// Confirmed gap: "I am a Texas state policymaker. What does the Texas
// legislature's recent reform of civil asset forfeiture law say..." has no
// literal "state legislature"/"state law" phrase anywhere, so neither
// detectJurisdiction nor the state_legislation PoliticalIntent fired, and
// the question fell through to the federal default -- sending its search
// to Congress.gov/House.gov/Senate.gov instead of Texas's own sources.
// Deliberately narrower than a generic legislative-content match (excludes
// bare "law"/"bill"/"committee"/"court", all of which describe federal
// government just as often) to avoid misreading an incidental state
// mention in an otherwise-federal question (e.g. "the president signed a
// law affecting Texas farmers") as a state-jurisdiction query.
const STATE_BRANCH_NOUN_RE =
  /\blegislature\b|\bgeneral assembly\b|\battorney general\b|\bgovernor'?s?\b|\bstate courts?\b|\bstate supreme court\b|\b(?:house|senate) bill \d+\b|\bhb\s?\d+\b|\bsb\s?\d+\b/i;

// Combines jurisdiction/state detection with an override: a state bill or
// state-branch noun mentioned without an obvious "state ___" phrase
// (detectJurisdiction alone would call it "federal") but that DOES name a
// state explicitly really does mean state jurisdiction -- correct that case
// without loosening jurisdiction detection for everything else (a federal
// bill that happens to mention a state for unrelated reasons should stay
// federal). Deliberately does NOT also require the absence of a federal
// signal: a genuinely mixed question ("the Texas Attorney General's stance
// compared to federal law") still needs state jurisdiction (and Texas's own
// state field populated) so its state-specific sources get searched --
// whether federal sources ALSO belong in that same search is a separate
// decision made downstream by classifyJurisdictionRouting, not this
// function. Callers that decompose one question into independent subtasks
// (each naming its own state) must call this PER SUBTASK, not once for the
// whole original question -- reusing a single outer resolution across
// subtasks about different states is exactly the bug this function's
// per-call granularity exists to avoid.
export function resolveJurisdictionAndState(
  text: string,
  intents: Set<PoliticalIntent>,
): { jurisdiction: Jurisdiction; state: string | null } {
  const jurisdiction = detectJurisdiction(text);
  if (jurisdiction === "federal") {
    const state = detectState(text);
    if (state && (intents.has("state_legislation") || STATE_BRANCH_NOUN_RE.test(text))) {
      return { jurisdiction: "state", state };
    }
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

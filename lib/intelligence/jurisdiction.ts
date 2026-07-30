// Ported from the Python app's tools/political_research: which level of
// government a question is actually about, and which state if any.
import { STATE_NAME_TO_CODE } from "@/lib/data/us-states";

export type Jurisdiction = "federal" | "state" | "local";

export const LOCAL_LEVEL_RE =
  /\b(city council|county commissioner\w*|county board|school board|park district|municipal\w*|mayor\w*|county clerk|county election\w*|local election\w*|town council|village board|city government|township trustee\w*|planning commission\w*)\b/i;

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

// A bare state-shaped bill number ("HB 312", "Senate Bill 10") with no state
// named is genuinely ambiguous -- every state numbers its bills starting
// from 1, so guessing which state's HB 312 the user means would be exactly
// the kind of unverified guess this project's anti-fabrication discipline
// avoids everywhere else. Matches today's actual two-jurisdiction capability
// (see lib/jurisdictions/options.ts) -- not a promise of all 50 states.
export const JURISDICTION_CLARIFICATION_MESSAGE = "Which jurisdiction do you mean? Illinois or Federal?";

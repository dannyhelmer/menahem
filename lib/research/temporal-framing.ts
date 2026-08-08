// Mechanical backstop for stale future-tense framing -- confirmed live:
// a response describing California's Delete Act deletion mechanism used
// future-projection language ("must begin processing requests by August
// 1, 2026") for a date that had already passed relative to the actual
// current date at the time the response was generated. The model IS given
// the real current date every request (see formatRuntimeContext in
// system-prompt.ts) and is now instructed there to compare a retrieved
// milestone date against it before choosing tense, but that's the same
// class of prompt-compliance gap every other mechanical check in this
// codebase exists for -- the source itself was written before the
// deadline and used future-tense phrasing at the time, and reproducing a
// retrieved source's own wording is exactly the failure mode that keeps
// slipping past instructions elsewhere too.
//
// Deliberately narrow, matching this codebase's other mechanical
// correctors: only flags an EXPLICIT, fully-specified "Month Day, Year"
// date immediately preceded by a curated future-projection trigger
// phrase -- never touches a bare year ("in 2028"), a date with no nearby
// projection language (a plain historical "enacted on October 10, 2023"
// is already correctly past-framed and left alone), or a date it can't
// confidently parse. Appends a neutral staleness note rather than
// rewriting the sentence's grammar or asserting a new, unconfirmed fact
// about what actually happened after the deadline -- the same "flag,
// don't guess" discipline as every other correction in this file's
// siblings (legislative-status.ts, unsupported-claims.ts).

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DATE_RE = new RegExp(`\\b(${MONTH_NAMES.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "g");

function parseMatchedDate(month: string, day: string, year: string): Date | null {
  const monthIndex = MONTH_NAMES.indexOf(month);
  if (monthIndex === -1) return null;
  const date = new Date(Number(year), monthIndex, Number(day));
  // Rejects an invalid calendar date (e.g. "February 30") rather than
  // silently normalizing it to some other date via JS's date-rollover
  // behavior -- a date this check can't confidently parse is left alone.
  if (date.getMonth() !== monthIndex || date.getDate() !== Number(day)) return null;
  return date;
}

// Curated trigger phrases that frame an upcoming date as a future plan or
// requirement rather than something already past -- checked in the text
// immediately before a matched date. Intentionally broad enough to catch
// both an explicit projection ("is expected to... by [date]") and a
// forward-looking obligation phrased as if it were still ahead ("must
// begin... by [date]", "goes live... beginning [date]").
const FUTURE_FRAME_RE =
  /\b(?:expected to|will|is scheduled to|are scheduled to|set to|scheduled for|goes live|go live|must begin|must comply|begin processing|beginning|starting)\b[^.]{0,80}$/i;
const WINDOW_CHARS = 100;

const STALE_DATE_NOTE = (dateText: string) => ` (this ${dateText} date has already passed)`;

export interface StaleFramingCorrection {
  date: string;
  index: number;
}

export function flagStaleFutureFraming(
  text: string,
  now: Date = new Date(),
): { text: string; corrections: StaleFramingCorrection[] } {
  const corrections: StaleFramingCorrection[] = [];
  let result = "";
  let lastEnd = 0;
  DATE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DATE_RE.exec(text)) !== null) {
    const [full, month, day, year] = match;
    const matchStart = match.index;
    const matchEnd = matchStart + full.length;

    const parsed = parseMatchedDate(month, day, year);
    if (!parsed || parsed.getTime() >= now.getTime()) continue;

    const windowStart = Math.max(0, matchStart - WINDOW_CHARS);
    const before = text.slice(windowStart, matchStart);
    if (!FUTURE_FRAME_RE.test(before)) continue;

    result += text.slice(lastEnd, matchEnd) + STALE_DATE_NOTE(full);
    corrections.push({ date: full, index: matchStart });
    lastEnd = matchEnd;
  }
  result += text.slice(lastEnd);
  return { text: result, corrections };
}

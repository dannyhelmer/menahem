// Fix 5 (bill validation): extracts a normalized, comparable bill
// identifier from text, for exact-match verification that a retrieved
// candidate is actually about the SPECIFIC bill a query named -- not just
// somewhere on an approved domain and vaguely on-topic. Deliberately
// separate from political-intent.ts's FEDERAL_BILL_RE/STATE_BILL_RE (used
// only for classification, i.e. "does this text mention A bill at all") --
// this needs the actual matched identifier, normalized, not just a
// yes/no signal, and needs to also catch state-specific shorthand those
// classification regexes don't (e.g. Vermont's "H.847" -- a bare chamber
// letter directly followed by digits, with no "R"/"B" in between).
//
// Ordered longest/most-specific alternative first so e.g. "H.Con.Res. 58"
// matches the h.con.res alternative rather than the bare "h." fallback
// consuming just the "H" and leaving "Con.Res. 58" as leftover text --
// JS regex alternation tries alternatives left-to-right at each position,
// so specificity order here directly determines correctness.
const BILL_NUMBER_RE =
  /\b(h\.?\s?con\.?\s?res\.?|h\.?\s?j\.?\s?res\.?|h\.?\s?res\.?|h\.?\s?r\.?|h\.?\s?b\.?|house bill|s\.?\s?con\.?\s?res\.?|s\.?\s?j\.?\s?res\.?|s\.?\s?res\.?|s\.?\s?b\.?|senate bill|s\.?|h\.?)\s*(\d+)\b/gi;

// Canonicalizes a matched prefix to a short, comparable code -- strips
// punctuation/whitespace and uppercases, so "H.R.", "h r", and "HR" all
// collapse to the same "HR", and spelled-out forms map to the same code as
// their abbreviation ("House Bill" and "HB" both become "HB"). Chamber is
// never collapsed between forms -- "SB" and "HB" always stay distinct.
function normalizePrefix(raw: string): string {
  const cleaned = raw.replace(/[.\s]/g, "").toUpperCase();
  if (cleaned === "HOUSEBILL") return "HB";
  if (cleaned === "SENATEBILL") return "SB";
  return cleaned;
}

// One normalized bill identifier from a question/task -- the first match
// only, since a single research task should only ever be asking about one
// specific bill. Returns null if the text doesn't name a specific bill
// number at all (a general topic question, not a specific-bill lookup).
export function extractBillNumber(text: string): string | null {
  BILL_NUMBER_RE.lastIndex = 0;
  const match = BILL_NUMBER_RE.exec(text);
  if (!match) return null;
  return `${normalizePrefix(match[1])}${match[2]}`;
}

// Every normalized bill identifier mentioned in a page's title/text -- used
// to check whether a FETCHED candidate actually discusses the specific bill
// a task named, not just some bill on an approved domain.
export function extractAllBillNumbers(text: string): string[] {
  const re = new RegExp(BILL_NUMBER_RE.source, BILL_NUMBER_RE.flags);
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    found.push(`${normalizePrefix(match[1])}${match[2]}`);
  }
  return found;
}

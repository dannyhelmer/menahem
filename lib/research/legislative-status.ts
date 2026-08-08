// Mechanical enforcement of conditional language for non-enacted
// legislation -- confirmed gap: the prompt-level instruction (see
// packet.ts) got the **Current Status:** field right ("Pending / Referred
// to Committee" for Illinois HB4809/HB2913, both live-verified against the
// real ilga.gov Bill Status page), but the Overview prose describing those
// same bills' provisions still used present tense ("It requires...", "The
// act mandates...") as if they were already in force. Relying on prompt
// compliance alone for this specific case had already failed once (the
// original "I'll need to gather more information" hedge-phrase gap was the
// same class of problem) -- this ties the correction directly to the
// ALREADY-VERIFIED status field instead, so it can't be skipped by an
// under-followed instruction.
//
// Deliberately narrow: only rewrites a present-tense verb when it directly
// follows an explicit subject referring to the bill itself (a bill number,
// "it", "the bill", "the act", "this legislation") -- a genuine present-
// tense fact about the status quo ("Illinois currently has no law
// addressing X") never matches this pattern and is never touched. Verb
// tense is the only thing rewritten; the sentence's factual content is
// never altered, which is why this is safe to do mechanically where
// swapping a citation's URL (a genuinely different, higher-risk kind of
// automated correction) is not.

const ENACTED_STATUS_RE = /\benacted\b|\bpublic act\b|\bsigned into law\b/i;

function isEnactedStatus(statusValue: string): boolean {
  return ENACTED_STATUS_RE.test(statusValue);
}

// [thirdPersonPresent, baseForm] -- explicit pairs rather than a suffix
// rule (e.g. "+s"), since English 3rd-person conjugation is irregular
// enough ("establish" -> "establishes", not "establishs"; "modify" ->
// "modifies", not "modifys") that deriving one from the other
// programmatically risks producing a malformed word.
const PROVISION_VERB_PAIRS: [string, string][] = [
  ["requires", "require"],
  ["establishes", "establish"],
  ["mandates", "mandate"],
  ["imposes", "impose"],
  ["prohibits", "prohibit"],
  ["amends", "amend"],
  ["creates", "create"],
  ["provides", "provide"],
  ["allows", "allow"],
  ["permits", "permit"],
  ["authorizes", "authorize"],
  ["directs", "direct"],
  ["expands", "expand"],
  ["repeals", "repeal"],
  ["modifies", "modify"],
  ["adds", "add"],
  ["removes", "remove"],
  ["grants", "grant"],
  ["defines", "define"],
  ["sets", "set"],
  ["limits", "limit"],
  ["bans", "ban"],
  ["restricts", "restrict"],
  ["extends", "extend"],
  ["increases", "increase"],
  ["reduces", "reduce"],
];
const VERB_BASE_FORM = new Map(PROVISION_VERB_PAIRS);
const VERB_ALTERNATION = PROVISION_VERB_PAIRS.map(([thirdPerson]) => thirdPerson).join("|");

// An explicit reference to the bill itself -- deliberately does NOT
// include bare nouns like "the law" (which would beg the question of
// whether it's actually law yet) or generic pronouns without a clear
// antecedent.
const SUBJECT_RE = "(?:H\\.?\\s?B\\.?\\s?\\d+|S\\.?\\s?B\\.?\\s?\\d+|H\\.?\\s?R\\.?\\s?\\d+|S\\.?\\s?\\d+|It|The bill|The act|This (?:bill|act|legislation))";
const PRIMARY_VERB_RE = new RegExp(`\\b(${SUBJECT_RE})\\s+(${VERB_ALTERNATION})\\b`, "gi");
const CONTINUATION_VERB_RE = new RegExp(`\\band\\s+(${VERB_ALTERNATION})\\b`, "gi");

function toConditional(verb: string): string {
  const base = VERB_BASE_FORM.get(verb.toLowerCase());
  return base ? `would ${base}` : verb;
}

// Only rewrites a paragraph if it ALREADY contains at least one primary
// (explicit-subject) match -- a paragraph with zero such matches is left
// completely untouched, even if one of the listed verbs appears in it for
// an unrelated reason. The "and <verb>" continuation check only runs
// inside a paragraph already confirmed to be describing this bill, so it
// can't fire on an unrelated "and requires..." elsewhere.
function correctParagraph(paragraph: string): { text: string; count: number } {
  PRIMARY_VERB_RE.lastIndex = 0;
  if (!PRIMARY_VERB_RE.test(paragraph)) return { text: paragraph, count: 0 };

  let count = 0;
  let result = paragraph.replace(PRIMARY_VERB_RE, (_match, subject: string, verb: string) => {
    count++;
    return `${subject} ${toConditional(verb)}`;
  });
  result = result.replace(CONTINUATION_VERB_RE, (_match, verb: string) => {
    count++;
    return `and ${toConditional(verb)}`;
  });
  return { text: result, count };
}

function correctSectionBody(body: string): { text: string; count: number } {
  let count = 0;
  const paragraphs = body.split(/(\n{2,})/); // keep separators so join is lossless
  const corrected = paragraphs.map((part) => {
    if (/^\n{2,}$/.test(part)) return part;
    const result = correctParagraph(part);
    count += result.count;
    return result.text;
  });
  return { text: corrected.join(""), count };
}

const CURRENT_STATUS_LINE_RE = /^\*\*Current Status:\*\*\s*(.+)$/im;
const HEADING_RE = /^##\s+(.+)$/gm;

export interface LegislativeStatusCorrection {
  section: string;
  status: string;
  verbsCorrected: number;
}

// Splits on the same "## <heading>" boundaries the multi-part planner
// already uses (see enforceSectionCitationScope in source-attribution.ts)
// so each entity's OWN Current Status field governs only its OWN section --
// a single-bill response with no "##" headings at all is treated as one
// section spanning the whole text.
export function enforceLegislativeStatusLanguage(text: string): { text: string; corrections: LegislativeStatusCorrection[] } {
  const headingMatches = [...text.matchAll(HEADING_RE)];
  const spans =
    headingMatches.length > 0
      ? headingMatches.map((m, i) => ({
          key: m[1].trim(),
          start: m.index + m[0].length,
          end: i + 1 < headingMatches.length ? headingMatches[i + 1].index! : text.length,
        }))
      : [{ key: "(single section)", start: 0, end: text.length }];

  const corrections: LegislativeStatusCorrection[] = [];
  let result = text;
  // Process spans in REVERSE so earlier spans' offsets stay valid as later
  // ones get rewritten (a correction never changes a span's start position
  // relative to spans before it, but does change the text after it).
  for (let i = spans.length - 1; i >= 0; i--) {
    const { key, start, end } = spans[i];
    const sectionText = result.slice(start, end);
    const statusMatch = sectionText.match(CURRENT_STATUS_LINE_RE);
    // No status field found in this section at all -- nothing to tie the
    // correction to, so this section is left untouched (fail open, not
    // closed, matching enforceSectionCitationScope's own convention).
    if (!statusMatch) continue;
    const statusValue = statusMatch[1].trim();
    if (isEnactedStatus(statusValue)) continue;

    const { text: correctedSection, count } = correctSectionBody(sectionText);
    if (count > 0) {
      result = result.slice(0, start) + correctedSection + result.slice(end);
      corrections.push({ section: key, status: statusValue, verbsCorrected: count });
    }
  }
  // Corrections were pushed in reverse span order -- restore left-to-right
  // for a log/report that reads in the order sections actually appear.
  corrections.reverse();
  return { text: result, corrections };
}

// Canonical-source preference -- confirmed live: "What does the Illinois
// Constitution say about the governor's veto power?" retrieved (and
// ranked alongside) constitutional-amendment proposals, a glossary page,
// unrelated ILCS statute pages, and an unrelated bill (HB4809), instead of
// clearly prioritizing the actual target -- Illinois Constitution Article
// IV, Section 9. The existing relevance ranking (scoreRelevance/
// rankingScore in orchestrate.ts) scores generic keyword overlap, which a
// page ABOUT the topic in name only (an amendment proposal mentioning
// "constitution," a glossary defining "veto") can satisfy just as well as
// the actual primary record -- and a single incidental keyword match was
// already enough to pass the relevance gate at all.
//
// This module identifies, from the question text alone, WHICH exact
// primary document/record type is being asked about (not just what
// TOPIC), so a candidate that IS that exact document can be boosted above
// everything else regardless of its own domain authority, and a
// candidate that merely mentions the same topic incidentally can be held
// to a stricter relevance bar instead of squeaking through on one shared
// word.

import { extractBillNumber } from "@/lib/intelligence/bill-number";

export type CanonicalTargetKind =
  | "constitution"
  | "statute"
  | "bill_text"
  | "bill_status"
  | "court_opinion"
  | "agency_record"
  | "current_officeholder";

export interface CanonicalTarget {
  kind: CanonicalTargetKind;
  // Specific identifying details extracted from the question -- an
  // Article/Section reference, a bill number, a statute citation, a case
  // name -- used to confirm a candidate is the EXACT document asked
  // about, not merely the same general type of document. Empty when the
  // question names the document TYPE but no further specifics (e.g. "what
  // does the constitution say about X" with no Article/Section given) --
  // the kind alone is still enough to apply the exclusion rules below.
  identifiers: string[];
}

const CONSTITUTION_RE = /\bconstitution\b/i;
const ARTICLE_RE = /\barticle\s+([ivxlcdm]+|\d+)\b/i;
const SECTION_RE = /\bsection\s+(\d+[a-z]?)\b/i;

// Illinois Compiled Statutes, U.S. Code, and Code of Federal Regulations
// citation shapes -- "760 ILCS 14", "18 U.S.C. 1030", "45 CFR 164.502".
const STATUTE_CITATION_RE = /\b\d+\s*(?:ILCS|U\.?S\.?C\.?|CFR)\s*(?:[§#]|sec\.?)?\s*\d+(?:[.\-]\d+)*\b/i;

const BILL_STATUS_HINT_RE = /\bstatus\b|\bwhat happened\b|\bcurrent status\b|\breferred\b|\bcommittee\b|\bpassed\b|\bsigned\b|\bvote(?:d|s)?\b/i;

// Party names are often multi-word ("Six Flags Entertainment Corp.",
// "Board of Education") -- one word per side would miss most real case
// names, so each side allows up to three additional capitalized words.
const CASE_NAME_RE = /\b([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+){0,3})\s+v\.?\s+([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+){0,3})\b/;
const COURT_HINT_RE = /\bopinion\b|\bholding\b|\bruling\b|\bcourt\b|\bdecided\b|\bdecision\b|\bcase\b/i;

const AGENCY_NAME_RE = /\b(?:attorney general|department of [a-z]+|[a-z]+ commission|[a-z]+ agency|board of [a-z]+)\b/i;
const AGENCY_ACTION_RE = /\baction\b|\bdecision\b|\bguidance\b|\bruling\b|\brecord\b|\benforcement\b|\bfiling\b|\border\b/i;

// Confirmed live: "Who is the current governor of Illinois?" retrieved
// (and the model was then allowed to answer from, citing an invented
// illinois.gov URL for) two completely unrelated illinois.gov pages -- a
// state-park trail closure and a farmers-market homepage -- because
// nothing in the retrieval/ranking pipeline recognized this as a specific
// kind of question at all, so it fell back to the same generic keyword
// scoring every other unclassified question gets. "Who currently holds
// office X" is a distinct, common question shape (governor, attorney
// general, senator, mayor, president, ...) that deserves the same
// treatment as a specific document: identify the OFFICE being asked
// about, then require a candidate to actually be about that office, not
// just any page on the jurisdiction's domain.
const OFFICE_TITLE_ALTERNATION =
  "governor|lieutenant governor|attorney general|secretary of state|treasurer|comptroller|" +
  "(?:u\\.?s\\.?\\s+)?senator|(?:u\\.?s\\.?\\s+)?representative|mayor|vice president|president|speaker of the house";
const WHO_IS_OFFICEHOLDER_RE = new RegExp(`\\bwho(?:'s|\\s+is)\\b[^.?!]{0,40}\\b(${OFFICE_TITLE_ALTERNATION})\\b`, "i");

// Order matters: a question can technically match more than one pattern
// (e.g. a statute citation inside a sentence that also says "court"), so
// the most specific/unambiguous signal is checked first. A bill number is
// checked before a bare statute citation since "HB4809" itself never
// looks like an ILCS/U.S.C./CFR citation, so there's no real overlap risk
// there -- constitution is checked first only because "Article"/"Section"
// language inside a constitution question could otherwise coincidentally
// resemble a statute citation pattern.
export function detectCanonicalTarget(question: string): CanonicalTarget | null {
  if (CONSTITUTION_RE.test(question)) {
    const identifiers: string[] = [];
    const articleMatch = question.match(ARTICLE_RE);
    if (articleMatch) identifiers.push(`article ${articleMatch[1].toLowerCase()}`);
    const sectionMatch = question.match(SECTION_RE);
    if (sectionMatch) identifiers.push(`section ${sectionMatch[1].toLowerCase()}`);
    return { kind: "constitution", identifiers };
  }

  const billNumber = extractBillNumber(question);
  if (billNumber) {
    const kind: CanonicalTargetKind = BILL_STATUS_HINT_RE.test(question) ? "bill_status" : "bill_text";
    return { kind, identifiers: [billNumber.toLowerCase()] };
  }

  const statuteMatch = question.match(STATUTE_CITATION_RE);
  if (statuteMatch) {
    return { kind: "statute", identifiers: [statuteMatch[0].toLowerCase().replace(/\s+/g, " ").trim()] };
  }

  const caseMatch = question.match(CASE_NAME_RE);
  if (caseMatch && COURT_HINT_RE.test(question)) {
    return { kind: "court_opinion", identifiers: [`${caseMatch[1].toLowerCase()} v ${caseMatch[2].toLowerCase()}`] };
  }

  // Checked before agency_record: "who is the attorney general" would
  // otherwise also satisfy AGENCY_NAME_RE's bare "attorney general" match,
  // but asking WHO holds an office is a more specific signal than merely
  // naming the office, and needs its own targeted query bias (see
  // packet.ts) rather than the generic "official agency record" one.
  const officeholderMatch = question.match(WHO_IS_OFFICEHOLDER_RE);
  if (officeholderMatch) {
    return { kind: "current_officeholder", identifiers: [officeholderMatch[1].toLowerCase().replace(/\s+/g, " ")] };
  }

  const agencyMatch = question.match(AGENCY_NAME_RE);
  if (agencyMatch && AGENCY_ACTION_RE.test(question)) {
    return { kind: "agency_record", identifiers: [agencyMatch[0].toLowerCase()] };
  }

  return null;
}

// Negative signals that mean a candidate is ABOUT the canonical document
// type in name only -- a proposal to amend it, a summary/glossary of
// terms used in it, an index -- never the primary record itself. This is
// the specific thing generic keyword-overlap relevance can't tell apart:
// an amendment proposal and the actual constitutional text both
// legitimately say "constitution" and often the same substantive words.
const CONSTITUTION_EXCLUSION_RE = /\bamend(?:ment|ing|s)?\b|\bpropos(?:al|ed|ition)\b|\bjoint resolution\b|\bglossary\b|\bdefinitions?\b|\bindex\b/i;

function includesAll(haystack: string, identifiers: string[]): boolean {
  return identifiers.every((id) => haystack.includes(id));
}

// Whether this specific candidate (not just something on-topic, but the
// actual document) satisfies the detected target. Checked against
// title+snippet before fetch and title+full-text after -- callers pass
// whatever text they have.
export function matchesCanonicalTarget(target: CanonicalTarget, url: string, title: string, bodyText = ""): boolean {
  const lowerTitle = title.toLowerCase();
  const lowerUrl = url.toLowerCase();
  const haystack = `${lowerTitle} ${bodyText.toLowerCase()}`;
  // A case-name identifier is built with a bare "v" separator (see
  // detectCanonicalTarget), but a real title/citation almost always
  // punctuates it ("Rosenbach v. Six Flags") -- normalized here so the
  // comparison isn't defeated by that period.
  const courtHaystack = haystack.replace(/\bv\.\s*/gi, "v ").replace(/\bversus\b/gi, "v");

  switch (target.kind) {
    case "constitution": {
      if (!CONSTITUTION_RE.test(title) && !CONSTITUTION_RE.test(url)) return false;
      if (CONSTITUTION_EXCLUSION_RE.test(title)) return false;
      return includesAll(haystack, target.identifiers);
    }
    case "bill_text":
      return lowerUrl.includes("fulltext") && includesAll(haystack, target.identifiers);
    case "bill_status":
      return lowerUrl.includes("billstatus") && !lowerUrl.includes("fulltext") && includesAll(haystack, target.identifiers);
    case "statute":
      return includesAll(haystack, target.identifiers);
    case "court_opinion":
      return includesAll(courtHaystack, target.identifiers);
    case "agency_record":
      return target.identifiers.length === 0 || target.identifiers.some((id) => haystack.includes(id));
    case "current_officeholder":
      // Confirmed live (round 2): checking the full haystack (title+body)
      // let this through for exactly the wrong reason. State agency sites
      // near-universally credit the sitting officeholder in a global
      // header/footer ("Governor JB Pritzker") on EVERY page of the
      // domain, so a trail-closure page's fetched body text still
      // contained "governor" -- title+body matching treated boilerplate
      // as if it were the page's actual subject. A page genuinely ABOUT
      // the officeholder (a bio/leadership page, a news article naming
      // them, the office's own portal page) names the office in its own
      // TITLE; incidental site-wide chrome does not. Title-only is also
      // what correctly keeps a multi-word office title ("attorney
      // general") from being satisfied by two unrelated incidental
      // mentions elsewhere on the page.
      return target.identifiers.every((id) => lowerTitle.includes(id));
    default:
      return false;
  }
}

// The ranking bonus applied ahead of the existing relevance+authority
// score -- large enough (checked as its own comparator key, not blended
// numerically) that a canonical match ALWAYS outranks a non-match,
// regardless of the non-match's own domain authority or keyword overlap.
// Doesn't reward .gov/official-domain status on its own -- a .gov page
// that merely shares the topic still scores 0 here unless it IS the
// specific document identified above.
export function canonicalRankBonus(target: CanonicalTarget | null, url: string, title: string, bodyText = ""): number {
  if (!target) return 0;
  return matchesCanonicalTarget(target, url, title, bodyText) ? 1 : 0;
}

// How much topical overlap a NON-canonical-match candidate needs once a
// canonical target has been identified -- a single incidental shared word
// (the old, lenient passesRelevanceGate bar) is what let amendment
// proposals, glossaries, and unrelated bills/statutes through just for
// containing "veto" or the jurisdiction's name. Requiring a real majority
// of the question's significant terms is a much higher bar, while still
// leaving room for a genuinely substantive secondary source (e.g. a law
// review article actually analyzing the same provision in depth) to
// qualify on its own merits.
export const CANONICAL_STRICT_RELEVANCE_RATIO = 0.5;

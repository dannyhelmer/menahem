// Mechanical fix for a distinct failure mode from enforcePrimarySourceCitation
// (source-attribution.ts): that check exists for "no official source was
// cited at all" -- its gate is satisfied the moment ANY government-tier
// source appears in the text. Confirmed live: for "What does the Illinois
// Constitution say about the governor's veto power?", the answer
// correctly discussed Article IV, Section 9, and DEBUG_RETRIEVAL
// confirmed the actual Illinois Constitution page WAS retrieved -- but
// the citation attached to the answer was "Illinois General Assembly -
// Public Act 104-0003" (repeated three times), never the Constitution
// itself. Public Act 104-0003 is genuinely official, so
// enforcePrimarySourceCitation's "was an official source cited" gate was
// already satisfied and never fired. This is a narrower, different claim:
// not "was AN official source cited" but "was the SPECIFIC document this
// answer is actually about cited" -- a citation attached to the wrong
// document isn't an unsupported claim needing a caveat, it's simply
// incorrect, the same way a claim attributed to the wrong case citation
// would be.

import { detectCanonicalTarget, matchesCanonicalTarget, type CanonicalTargetKind } from "@/lib/search/canonical-source";
import { normalizeUrlForComparison } from "./source-attribution";

export interface CanonicalSourceLike {
  title: string;
  url: string;
  tier: string;
}

export interface CanonicalCitationCorrection {
  section: string;
  replacedUrl: string;
  canonicalUrl: string;
}

// A section counts as substantively about the canonical target's subject
// -- not just mentioning it in passing -- when it names the document TYPE
// itself (e.g. "constitution"). Scoped per-section so a response that
// ALSO legitimately cites the "wrong" official source for a genuinely
// different claim elsewhere (a Public Act that really did amend something
// unrelated, discussed in its own section) is left alone there.
const TYPE_SIGNAL_RE: Record<CanonicalTargetKind, RegExp> = {
  constitution: /\bconstitution\b/i,
  statute: /\bstatute\b|\bILCS\b|\bU\.?S\.?C\.?\b/i,
  bill_text: /\bbill\b/i,
  bill_status: /\bbill\b|\bstatus\b/i,
  court_opinion: /\bopinion\b|\bcourt\b|\bheld\b|\bholding\b/i,
  agency_record: /\bagency\b/i,
};

const HEADING_RE = /^##\s+(.+)$/gm;
// Shared with source-attribution.ts's own citation scanner in shape (markdown
// link OR bare URL) -- kept as a separate local copy rather than importing
// a private regex, since this module's replacement needs a custom
// per-match substitution (the canonical citation), not source-attribution's
// fixed NOT_VERIFIED_PHRASE.
const CITATION_MATCH_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)\]}"'<>]+)/g;

// Deliberately NOT source-attribution.ts's isSourceReferenced -- that
// function also matches on a source's TITLE appearing anywhere in the
// text, which is exactly wrong here: a Constitution question's own prose
// legitimately says "the Illinois Constitution" as its subject, with no
// citation/link attached at all, and that title-text match would
// otherwise make this function think the canonical source was "already
// cited" when no actual link to it exists anywhere. This checks
// specifically for an actual URL match -- a real citation, not a mention.
function isUrlActuallyCited(text: string, url: string): boolean {
  const target = normalizeUrlForComparison(url);
  for (const match of text.matchAll(CITATION_MATCH_RE)) {
    const cited = match[2] ?? match[3];
    if (cited && normalizeUrlForComparison(cited) === target) return true;
  }
  return false;
}

// Replaces every citation of a DIFFERENT official source, within a
// section substantively about the canonical target's subject, with the
// actual canonical document's own citation. Fails open (does nothing)
// whenever the canonical document itself was never retrieved at all --
// this corrects a citation SELECTION mistake among sources that were
// actually retrieved; it never invents a source that doesn't exist.
export function enforceCanonicalDocumentCitation(
  text: string,
  question: string,
  allSources: CanonicalSourceLike[],
): { text: string; corrections: CanonicalCitationCorrection[] } {
  const target = detectCanonicalTarget(question);
  if (!target) return { text, corrections: [] };

  const canonicalSource = allSources.find((s) => matchesCanonicalTarget(target, s.url, s.title));
  if (!canonicalSource) return { text, corrections: [] };

  const wrongOfficialSources = allSources.filter(
    (s) => s.tier === "government" && !matchesCanonicalTarget(target, s.url, s.title),
  );
  const wrongUrlSet = new Set(wrongOfficialSources.map((s) => normalizeUrlForComparison(s.url)));
  if (wrongUrlSet.size === 0) return { text, corrections: [] };

  const headingMatches = [...text.matchAll(HEADING_RE)];
  const spans =
    headingMatches.length > 0
      ? headingMatches.map((m, i) => ({
          key: m[1].trim(),
          start: m.index + m[0].length,
          end: i + 1 < headingMatches.length ? headingMatches[i + 1].index! : text.length,
        }))
      : [{ key: "(single section)", start: 0, end: text.length }];

  const corrections: CanonicalCitationCorrection[] = [];
  let result = text;
  // Process spans in reverse so an earlier span's positions stay valid --
  // same convention as every other mechanical corrector in this codebase.
  for (let i = spans.length - 1; i >= 0; i--) {
    const { key, start, end } = spans[i];
    const sectionText = result.slice(start, end);
    if (!TYPE_SIGNAL_RE[target.kind].test(sectionText)) continue;
    // Already correctly cited somewhere in this section -- leave any
    // additional citations alone rather than second-guessing a response
    // that also draws on other sources for other claims.
    if (isUrlActuallyCited(sectionText, canonicalSource.url)) continue;

    let replacedAny = false;
    const correctedSection = sectionText.replace(CITATION_MATCH_RE, (match, _label, mdUrl, bareUrl) => {
      const url: string | undefined = mdUrl ?? bareUrl;
      if (!url || !wrongUrlSet.has(normalizeUrlForComparison(url))) return match;
      replacedAny = true;
      corrections.push({ section: key, replacedUrl: url, canonicalUrl: canonicalSource.url });
      return `[${canonicalSource.title}](${canonicalSource.url})`;
    });

    if (replacedAny) {
      result = result.slice(0, start) + correctedSection + result.slice(end);
    }
  }
  corrections.reverse();
  return { text: result, corrections };
}

// Post-generation source-attribution filter. The retrieval set (everything
// fetched from gov-data providers and web search) is never the same thing
// as "sources that actually support this specific response" -- a web search
// routinely returns tangentially related pages that never get used. Showing
// the full retrieval set as "Sources" misrepresents what backs the answer,
// so the Sources/Evidence Strength/citation surfaces must all be built from
// the same, generation-validated set instead of the raw retrieval set.

export interface AttributableSource {
  title: string;
  url: string;
  // Sources built directly into the response's own factual content before
  // the model ever runs (a gov-data-provider bill record used to construct
  // the standardized header, or the document a Q&A session is actually
  // about) are known to have been used regardless of whether the model
  // happens to name them in prose -- these are never filtered out. Anything
  // else (ordinary web search results) is only kept if the generated text
  // actually references it.
  provenance?: "always_keep" | "web_search";
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// A source counts as referenced if the final response text names it --
// by URL, by hostname (covers "Congress.gov" being written out even though
// the retrieved title was "Congress.gov -- H.R. 1"), or by ANY
// separator-delimited clause of its title, not just the first. A page's
// title can put the actual site/organization name in any position --
// "California Legislative Information - SB 100" and "SB 102 - The Florida
// Senate" are both real, common shapes, and a citation like "(Florida
// Senate)" must still match the second one, not just a title that happens
// to lead with the org name.
export function isSourceReferenced(text: string, source: { title: string; url: string }): boolean {
  const lowerText = text.toLowerCase();
  if (source.url && lowerText.includes(source.url.toLowerCase())) return true;

  const host = hostnameOf(source.url);
  if (host && lowerText.includes(host)) return true;

  const clauses = source.title.split(/[-–—|:]/).map((clause) => clause.trim());
  return clauses.some((clause) => clause.length >= 4 && lowerText.includes(clause.toLowerCase()));
}

// Filters a retrieval set down to only what the final response actually
// used -- the single function that Sources, Evidence Strength, and inline
// citations must all be derived from, so the three surfaces can never
// disagree about what backs the answer.
export function filterUsedSources<T extends AttributableSource>(text: string, sources: T[]): T[] {
  return sources.filter((source) => source.provenance === "always_keep" || isSourceReferenced(text, source));
}

// A stricter check than filterUsedSources: not just "was ANY source
// referenced" but specifically "was a GOVERNMENT-tier source referenced."
// Used by the validated-generation path (app/api/chat/route.ts) to decide
// whether a generated response that had official sources available to it
// actually cited one -- retrieval succeeding is not the same claim as the
// model's own prose having actually drawn on it. Structurally typed (no
// import of ResearchPacket's TieredSource) to avoid a cross-module
// dependency between this file and lib/research/packet.ts.
export function hasOfficialCitation<T extends { title: string; url: string; tier: string }>(
  text: string,
  sources: T[],
): boolean {
  return sources.some((s) => s.tier === "government" && isSourceReferenced(text, s));
}

// A different question than hasOfficialCitation: not "did the text cite an
// official source" but "was an official source retrieved AT ALL, and did
// NONE of them make it into what was actually cited." Used to surface a
// caveat on paths that don't have hasOfficialCitation's whole-response
// rejection gate (multi-part, deep research) -- those have no other signal
// today connecting "official source existed" to "but this response didn't
// use it." Confirmed live: an Illinois BIPA query retrieved the actual
// ILCS statute page, ranked it #1, but the model cited only secondary
// sources -- on a single-question path this trips hasOfficialCitation's
// full rejection; on a multi-part/deep-research path nothing flagged it at
// all before this.
export function hasUnusedOfficialSource<T extends { tier: string }>(allSources: T[], usedSources: T[]): boolean {
  return allSources.some((s) => s.tier === "government") && !usedSources.some((s) => s.tier === "government");
}

// Normalizes a URL for comparison purposes only (never for display) --
// lowercases the host, strips a leading "www." and a single trailing slash.
// Deliberately leaves path/query untouched: over-normalizing (e.g. ignoring
// query strings) risks a false negative where two genuinely different pages
// on the same host get treated as the same citation.
function normalizeUrlForComparison(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "");
    return `${host}${path}${parsed.search}`;
  } catch {
    return url.toLowerCase();
  }
}

const CITED_URL_RE = /https?:\/\/[^\s)\]}"'<>]+/g;

// Fix 1 (citation fabrication): scans generated text for every URL it
// actually cites and returns the ones that don't match ANY retrieved
// source's URL -- the mechanical backstop for "every cited source must
// originate from retrieved evidence." A response can pass hasOfficialCitation
// (cites one real official source) while ALSO fabricating a second URL
// nobody retrieved -- confirmed in production: a multi-part comparison
// answer cited a plausible-sounding flsenate.gov URL that never appeared
// anywhere in that subtask's actual retrieved data. Only checks that a
// cited URL was genuinely retrieved, not that the specific claim next to it
// is accurate -- verifying claim-level accuracy is a comprehension task for
// the model's own instructions (see the field-independence rules in
// packet.ts), not something a URL-matching function can determine.
export function findFabricatedCitations(text: string, sources: { url: string }[]): string[] {
  const retrieved = new Set(sources.map((s) => normalizeUrlForComparison(s.url)));
  const cited = text.match(CITED_URL_RE) ?? [];
  const fabricated: string[] = [];
  const seen = new Set<string>();
  for (const rawUrl of cited) {
    const url = rawUrl.replace(/[.,;:!?)\]}'"]+$/, "");
    const normalized = normalizeUrlForComparison(url);
    if (retrieved.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    fabricated.push(url);
  }
  return fabricated;
}

// The exact phrase used everywhere a citation/field can't be honestly
// filled -- matches the phrase already required at the prompt level (see
// packet.ts/planner.ts) so a mechanically-corrected citation reads exactly
// like a model-written one, not like a different, second voice.
const NOT_VERIFIED_PHRASE = "Not verified from retrieved official sources";

// Matches a markdown link whose href is NOT a real http(s) URL. Every
// legitimate citation in this app is a full http(s) URL that was actually
// retrieved -- so a link shaped like `[label](non-url text)` is never a
// genuine reference, no matter what the label says. Left alone it still
// renders as a clickable-looking citation in the UI, which is worse than
// plain caveat prose: it visually promises a source that doesn't exist.
// This is exactly what happens when the model wraps its own hedge (the
// NOT_VERIFIED_PHRASE, or an equivalent one it invents) inside link syntax
// instead of writing it as a plain sentence.
const NON_URL_LINK_RE = /\[([^\]]+)\]\((?!https?:\/\/)[^)]*\)/g;

// Fix (placeholder-in-link): flattens any markdown link whose href isn't a
// real URL down to plain NOT_VERIFIED_PHRASE text -- dropping both the
// label and the bogus href, the same "replace whole, don't patch" approach
// scanAndReplaceCitations takes for an invalid markdown link. Runs
// independently of the URL-based checks above (this class of link isn't a
// citation with a wrong/fabricated URL, it's not a citation at all).
export function stripPlaceholderLinks(text: string): { text: string; count: number } {
  let count = 0;
  const result = text.replace(NON_URL_LINK_RE, () => {
    count++;
    return NOT_VERIFIED_PHRASE;
  });
  return { text: result, count };
}

// Matches EITHER a markdown link `[label](url)` (captures label in group 1,
// url in group 2) OR a bare URL (captures in group 3) -- one shared pattern
// so scanAndReplaceCitations only has to walk the text once. The markdown
// form's URL segment stops at whitespace or `)` (a real URL practically
// never contains either unencoded), so it doesn't need the same trailing-
// punctuation stripping the bare form does.
const CITATION_MATCH_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)\]}"'<>]+)/g;

// Position-aware citation scanner/replacer -- the shared core both the
// global-fabrication pass and the per-section scope pass (below) build on,
// so URL-matching/markdown-link-vs-bare-URL logic exists in exactly one
// place. `isInvalidAt(url, index)` decides per-citation whether it should
// be replaced; `index` is the citation's character offset in `text`, which
// is what lets a caller implement section-scoped validity (see
// enforceSectionCitationScope) without this function needing to know
// anything about sections itself. An invalid markdown link is replaced
// whole (`[label](url)` -> the phrase, since a broken href with a
// non-URL value would render as a dead link); an invalid bare URL is
// replaced in place, leaving any trailing punctuation untouched.
export function scanAndReplaceCitations(
  text: string,
  isInvalidAt: (url: string, index: number) => boolean,
): { text: string; replaced: { url: string; index: number }[] } {
  const replaced: { url: string; index: number }[] = [];
  let result = "";
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  CITATION_MATCH_RE.lastIndex = 0;
  while ((match = CITATION_MATCH_RE.exec(text)) !== null) {
    const isMarkdownLink = match[2] !== undefined;
    const rawUrl = (isMarkdownLink ? match[2] : match[3])!;
    const url = isMarkdownLink ? rawUrl : rawUrl.replace(/[.,;:!?)\]}'"]+$/, "");
    const matchStart = match.index;
    const consumedEnd = isMarkdownLink ? matchStart + match[0].length : matchStart + url.length;

    if (isInvalidAt(url, matchStart)) {
      result += text.slice(lastEnd, matchStart) + NOT_VERIFIED_PHRASE;
      replaced.push({ url, index: matchStart });
      lastEnd = consumedEnd;
    }
  }
  result += text.slice(lastEnd);
  return { text: result, replaced };
}

export interface CitationSection {
  key: string;
  sources: { url: string }[];
}

// Fix (per-section source scoping): a citation is only valid within the
// SAME section it was retrieved for, even when it's genuinely official and
// even when it's cited somewhere else in the same response -- confirmed in
// production: a Florida section cited a URL that was genuinely retrieved,
// but for a Virginia section elsewhere in the same multi-part answer.
// findFabricatedCitations alone can't catch this (the URL IS in the
// combined retrieval set); this function is specifically the "retrieved,
// but for the WRONG section" check. Locates each section's exact
// "## <key>" heading, in the order they actually appear in `text` (not
// assumed from `sections`' input order, since the model might reorder
// them), and treats the span from one heading to the next as that
// section's own scope. A section whose heading can't be found in the text
// is skipped entirely (fail open, not closed) -- nothing before the first
// recognized heading, or belonging to an unrecognized section, is second-
// guessed here; that's the existing global fabrication check's job.
export function enforceSectionCitationScope(
  text: string,
  sections: CitationSection[],
): { text: string; violations: { section: string; url: string }[] } {
  if (sections.length === 0) return { text, violations: [] };

  const headingMatches: { key: string; contentStart: number }[] = [];
  for (const section of sections) {
    const escaped = section.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const headingRe = new RegExp(`^##\\s+${escaped}\\s*$`, "m");
    const match = headingRe.exec(text);
    if (match) headingMatches.push({ key: section.key, contentStart: match.index + match[0].length });
  }
  if (headingMatches.length === 0) return { text, violations: [] };
  headingMatches.sort((a, b) => a.contentStart - b.contentStart);

  const sourcesByKey = new Map(
    sections.map((s) => [s.key, new Set(s.sources.map((src) => normalizeUrlForComparison(src.url)))]),
  );

  const violations: { section: string; url: string }[] = [];
  const { text: correctedText } = scanAndReplaceCitations(text, (url, index) => {
    let currentSection: { key: string; contentStart: number } | undefined;
    for (const h of headingMatches) {
      if (h.contentStart > index) break;
      currentSection = h;
    }
    // Before the first recognized heading -- not this pass's concern.
    if (!currentSection) return false;
    const validSet = sourcesByKey.get(currentSection.key);
    if (!validSet || validSet.has(normalizeUrlForComparison(url))) return false;
    violations.push({ section: currentSection.key, url });
    return true;
  });

  return { text: correctedText, violations };
}

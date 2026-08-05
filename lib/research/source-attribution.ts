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

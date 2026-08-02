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
// the retrieved title was "Congress.gov -- H.R. 1"), or by the first clause
// of its title (covers a page title like "California Legislative Information
// - SB 100" being shortened in prose to just "California Legislative
// Information").
export function isSourceReferenced(text: string, source: { title: string; url: string }): boolean {
  const lowerText = text.toLowerCase();
  if (source.url && lowerText.includes(source.url.toLowerCase())) return true;

  const host = hostnameOf(source.url);
  if (host && lowerText.includes(host)) return true;

  const firstClause = (source.title.split(/[-–—|:]/)[0] ?? "").trim();
  if (firstClause.length >= 4 && lowerText.includes(firstClause.toLowerCase())) return true;

  return false;
}

// Filters a retrieval set down to only what the final response actually
// used -- the single function that Sources, Evidence Strength, and inline
// citations must all be derived from, so the three surfaces can never
// disagree about what backs the answer.
export function filterUsedSources<T extends AttributableSource>(text: string, sources: T[]): T[] {
  return sources.filter((source) => source.provenance === "always_keep" || isSourceReferenced(text, source));
}

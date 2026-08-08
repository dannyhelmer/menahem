// Illinois General Assembly session identity -- confirmed gap: Illinois
// bill numbers reset every General Assembly (a new GA every 2 years), so
// "HB4809" alone never uniquely identifies a bill. Live-confirmed: the
// 103rd GA's HB4809 (passed the House April 2024, later became law) and
// the 104th GA's HB4809 (a completely different bill -- the Data Broker
// Registration and Accessible Deletion Mechanism Act, introduced Feb 2026,
// still pending in the Rules Committee) both normalize to the identical
// bill-number string, and got conflated -- an older bill's "became law"
// status was applied to the current pending bill in a live response.
//
// The canonical identity for an Illinois bill is GA + chamber + number,
// not number alone. This module supplies the GA half: computing which GA
// is "current" (the default, absent an explicit session in the question)
// and extracting which GA a retrieved page is actually FROM, so a
// wrong-session candidate can be rejected before it ever reaches the
// model -- the same mechanism this project already uses for cross-state
// domain contamination (see stateForDomain in lib/search/source-router.ts).

// Illinois General Assemblies are numbered sequentially, one per 2-year
// term starting the second week of January in each odd-numbered year --
// the 100th GA began January 2017. Approximated here by calendar year
// (not the exact inauguration date), which is precise except for a few
// weeks around each January transition in an odd year -- acceptable for a
// "what's the current session by default" assumption, not a legal record.
const ANCHOR_GA = 100;
const ANCHOR_YEAR = 2017;

export function currentIllinoisGeneralAssembly(date: Date = new Date()): number {
  const year = date.getFullYear();
  return ANCHOR_GA + Math.floor((year - ANCHOR_YEAR) / 2);
}

// Matches how Illinois's own official sources (ilga.gov) self-describe --
// e.g. "104th General Assembly" -- so this reads the session directly off
// the authoritative record rather than inferring it from a URL parameter
// (ILGA's GAID query param does encode this too, but requires an external,
// unverified GAID-to-GA-number mapping this project has no confirmed
// source for; the page's own stated session text does not). Matches the
// plural "Assemblies" too -- a question naming two sessions in one breath
// ("the 103rd and 104th General Assemblies") uses the shared plural noun,
// not "Assembly" twice, so a singular-only pattern would silently miss it.
const GENERAL_ASSEMBLY_ANCHOR_RE = /General\s+Assembl(?:y|ies)\b/gi;
const ORDINAL_RE = /\b(\d+)(?:st|nd|rd|th)\b/g;
// How far back from the "General Assembly(ies)" anchor to look for ordinal
// numbers -- covers "the 103rd and 104th General Assemblies" (list of
// ordinals sharing one trailing noun) as well as the simple "104th General
// Assembly" case, without matching an unrelated ordinal earlier in a long
// sentence.
const ORDINAL_LOOKBACK_CHARS = 40;

// Every GA session number mentioned in the text, deduplicated and sorted
// ascending -- e.g. "Compare HB4809 in the 103rd and 104th General
// Assemblies" yields [103, 104]. Used where a question may legitimately
// name more than one session (a cross-session comparison), not just one.
export function extractAllGeneralAssemblies(text: string): number[] {
  const found = new Set<number>();
  for (const anchor of text.matchAll(GENERAL_ASSEMBLY_ANCHOR_RE)) {
    const windowStart = Math.max(0, anchor.index - ORDINAL_LOOKBACK_CHARS);
    const window = text.slice(windowStart, anchor.index);
    for (const ordinal of window.matchAll(ORDINAL_RE)) {
      found.add(Number.parseInt(ordinal[1], 10));
    }
  }
  return Array.from(found).sort((a, b) => a - b);
}

export function extractGeneralAssembly(text: string): number | null {
  const all = extractAllGeneralAssemblies(text);
  return all.length > 0 ? all[0] : null;
}

// The actual collision-rejection decision: true only on an ACTIVE
// mismatch (text explicitly states a DIFFERENT GA than expected) --
// fail-open when the text doesn't state any GA at all, since many
// legitimate secondary sources never mention the session explicitly, and
// silence is not evidence of a wrong bill.
export function isGeneralAssemblyMismatch(text: string, expectedGeneralAssembly: number): boolean {
  const found = extractGeneralAssembly(text);
  return found !== null && found !== expectedGeneralAssembly;
}

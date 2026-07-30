// Jurisdiction selector options for the dashboard -- UI-only for now (see
// Phase 12 plan): selecting one doesn't yet change what the research
// pipeline does, since lib/intelligence/jurisdiction.ts's text-based
// detection already covers today's real capability. Adding a future state
// is one entry here; no other file needs to change for the UI to pick it up.
export interface JurisdictionOption {
  code: string;
  label: string;
  flag: string;
}

export const JURISDICTION_OPTIONS: JurisdictionOption[] = [
  { code: "federal", label: "United States (Federal)", flag: "\u{1F1FA}\u{1F1F8}" },
  { code: "IL", label: "Illinois", flag: "\u{1F3DB}️" },
];

export const DEFAULT_JURISDICTION_CODE = "federal";

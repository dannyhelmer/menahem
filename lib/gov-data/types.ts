export interface GovSource {
  title: string;
  url: string;
}

export interface GovRetrievalResult {
  success: boolean;
  liveData?: string;
  sources?: GovSource[];
  note?: string;
  // Which knowledge-graph entities this result touched, if any -- lets the
  // research packet check for related history (e.g. other bills the same
  // representative sponsored) without needing provider-specific knowledge.
  graph?: { entityId?: string; representativeId?: string };
}

export interface GovDataProvider {
  id: string;
  label: string;
  jurisdiction: "federal" | "state" | "local";
  isConfigured(): Promise<boolean>;
  retrieve(query: string): Promise<GovRetrievalResult>;
}

// Documented but not yet implemented -- adding a real one later is one new
// file (implementing GovDataProvider) plus one entry in registry.ts's
// GOV_DATA_PROVIDERS, never new plumbing. Kept as plain metadata here
// rather than fake provider objects, so nothing pretends to work.
export interface PlannedProvider {
  id: string;
  label: string;
  jurisdiction: "federal" | "state" | "local";
}

export const PLANNED_PROVIDERS: PlannedProvider[] = [
  { id: "federal_register", label: "Federal Register", jurisdiction: "federal" },
  { id: "opensecrets", label: "OpenSecrets", jurisdiction: "federal" },
  { id: "state_legislature", label: "State Legislature APIs", jurisdiction: "state" },
  { id: "court_opinions", label: "Court Opinion Providers", jurisdiction: "federal" },
  { id: "ballotpedia", label: "Ballotpedia", jurisdiction: "federal" },
  { id: "govinfo", label: "GovInfo", jurisdiction: "federal" },
  { id: "census", label: "Census Bureau", jurisdiction: "federal" },
  { id: "cbo", label: "Congressional Budget Office", jurisdiction: "federal" },
  { id: "state_constitutions", label: "State Constitutions", jurisdiction: "state" },
  { id: "election_apis", label: "Election APIs", jurisdiction: "state" },
];

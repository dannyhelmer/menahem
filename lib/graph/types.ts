// A generic entity/relationship schema, populated opportunistically from
// whatever government-data providers actually return (see lib/gov-data/).
// The type vocabulary covers the full long-term vision even though only a
// few types have real data behind them yet -- matches the same "define
// honestly, populate only what's real" precedent as PLANNED_PROVIDERS in
// lib/gov-data/types.ts.
export type EntityType =
  | "bill"
  | "representative"
  | "committee"
  | "candidate"
  | "governor"
  | "president"
  | "court"
  | "judge"
  | "constitution"
  | "amendment"
  | "statute"
  | "agency"
  | "campaign"
  | "donor"
  | "district"
  | "budget"
  | "election"
  | "vote"
  | "political_party";

export interface GraphEntity {
  id: string;
  type: EntityType;
  label: string;
  data: Record<string, unknown>;
  source: string;
  updatedAt: string;
}

// Only one canonical direction is stored per relationship (e.g. "sponsored"
// always means representative -> bill) -- the store's query API supports
// either endpoint, so the inverse is a query-direction choice, not a
// second, driftable copy of the same fact.
export type RelationshipType =
  | "sponsored"
  | "member_of_committee"
  | "has_committee"
  | "voted_on"
  | "represents_district"
  | "donated_to"
  | "related_bill"
  | "references_constitution"
  | "cites_court_case";

export interface GraphEdge {
  from: string;
  to: string;
  relationship: RelationshipType;
  data?: Record<string, unknown>;
}

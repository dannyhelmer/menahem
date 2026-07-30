// A generic chronological event history attachable to any graph entity
// (a bill today; court cases/elections later). Populated from real
// provider data only -- never invented or guessed.
export type BillStage =
  | "introduced"
  | "committee"
  | "floor_vote"
  | "passed_chamber"
  | "resolving_differences"
  | "to_president"
  | "signed"
  | "vetoed"
  | "other";

export interface TimelineEvent {
  date: string;
  label: string;
  description: string;
  stage: BillStage;
}

export interface Timeline {
  entityId: string;
  events: TimelineEvent[];
  updatedAt: string;
}

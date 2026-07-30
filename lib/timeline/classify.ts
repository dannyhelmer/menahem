import type { BillStage } from "./types";

// Conservative keyword classification of a source's own action text --
// matches this project's established regex-routing philosophy (see
// task-classifier.ts/political-intent.ts). Never guesses beyond what the
// text says; anything unrecognized stays honestly bucketed as "other"
// rather than forced into the wrong stage.
const STAGE_PATTERNS: [BillStage, RegExp][] = [
  ["vetoed", /\bvetoed\b/i],
  ["signed", /\bsigned by (the )?president\b|\bsigned by (the )?governor\b|\bbecame public law\b|\bbecame law\b/i],
  ["to_president", /\bpresented to (the )?president\b/i],
  ["resolving_differences", /\bconference\b|\bresolving differences\b|\bamendment (between|exchange)\b/i],
  ["passed_chamber", /\bpassed (house|senate)\b|\bagreed to\b/i],
  ["floor_vote", /\bmotion to\b|\bconsidered by\b|\bfloor\b|\bdebate\b/i],
  ["committee", /\breferred to\b|\bcommittee on\b|\breported by\b|\bordered to be reported\b/i],
  ["introduced", /\bintroduced in (house|senate)\b|\bread the first time\b|\bread twice\b/i],
];

export function classifyBillStage(actionText: string): BillStage {
  for (const [stage, pattern] of STAGE_PATTERNS) {
    if (pattern.test(actionText)) return stage;
  }
  return "other";
}

const STAGE_LABELS: Record<BillStage, string> = {
  introduced: "Introduced",
  committee: "Referred to Committee",
  floor_vote: "Floor Action",
  passed_chamber: "Passed Chamber",
  resolving_differences: "Resolving Differences",
  to_president: "Presented to President",
  signed: "Signed Into Law",
  vetoed: "Vetoed",
  other: "Action",
};

export function stageLabel(stage: BillStage): string {
  return STAGE_LABELS[stage];
}

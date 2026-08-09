import { describe, it, expect } from "vitest";
import { computeSignificantTerms, passesRelevanceGate, rankingScore, scoreRelevance } from "./orchestrate";

const DATA_BROKER_TASK =
  "Compare enacted state data broker laws and recommend provisions Illinois should adopt. Use official " +
  "legislative and state government sources. Focus specifically on Nevada Privacy of Information Collected " +
  "on the Internet from Consumers Act in Nevada, and answer only for this specific entity.";

describe("computeSignificantTerms", () => {
  it("excludes the state's own name when given as excludeStateName", () => {
    const terms = computeSignificantTerms(DATA_BROKER_TASK, "Nevada");
    expect(terms).not.toContain("nevada");
    expect(terms).toContain("broker");
    expect(terms).toContain("data");
  });

  it("excludes task-template boilerplate (entity, specifically, focus)", () => {
    const terms = computeSignificantTerms(DATA_BROKER_TASK, "Nevada");
    expect(terms).not.toContain("entity");
    expect(terms).not.toContain("specifically");
    expect(terms).not.toContain("focus");
  });

  it("excludes every word of a multi-word state name", () => {
    const terms = computeSignificantTerms("Compare data broker laws in West Virginia.", "West Virginia");
    expect(terms).not.toContain("west");
    expect(terms).not.toContain("virginia");
    expect(terms).toContain("broker");
  });

  it("still returns real topic terms untouched when no state is given", () => {
    const terms = computeSignificantTerms("Compare data broker laws.", null);
    expect(terms).toContain("data");
    expect(terms).toContain("broker");
  });
});

describe("scoreRelevance / passesRelevanceGate -- the confirmed Nevada/Massachusetts contamination cases", () => {
  const terms = computeSignificantTerms(DATA_BROKER_TASK, "Nevada");

  it("rejects a page that matched ONLY the state name -- the confirmed Nevada campaign-finance PDF", () => {
    const relevance = scoreRelevance(terms, "Campaign Finance and Financial Disclosure - Nevada Legislature", "");
    expect(relevance.matchedTerms).toEqual([]);
    expect(passesRelevanceGate(terms, relevance)).toBe(false);
  });

  it("rejects a page that matched ONLY the boilerplate word 'entity' -- the confirmed Massachusetts case", () => {
    const maTerms = computeSignificantTerms(DATA_BROKER_TASK.replace(/Nevada/g, "Massachusetts"), "Massachusetts");
    const relevance = scoreRelevance(maTerms, "General Requirements for All Business Entity Types", "");
    expect(relevance.matchedTerms).toEqual([]);
    expect(passesRelevanceGate(maTerms, relevance)).toBe(false);
  });

  it("accepts a page with a genuine topic-term match", () => {
    const relevance = scoreRelevance(terms, "Nevada Data Broker Registration Requirements", "");
    expect(relevance.matchedTerms).toContain("broker");
    expect(relevance.titleMatch).toBe(true);
    expect(passesRelevanceGate(terms, relevance)).toBe(true);
  });

  it("fails open (accepts everything) when no significant terms exist at all", () => {
    const relevance = scoreRelevance([], "Anything At All", "");
    expect(passesRelevanceGate([], relevance)).toBe(true);
    expect(relevance.ratio).toBe(1);
  });
});

describe("passesRelevanceGate -- canonical-aware mode (the confirmed Illinois Constitution veto-power case)", () => {
  const question = "What does the Illinois Constitution say about the governor's veto power?";
  const terms = computeSignificantTerms(question, "Illinois");

  it("still passes the actual canonical match even with a low raw relevance ratio", () => {
    // The canonical match itself might only share one or two of the
    // question's significant terms in its title/snippet (the rest is in
    // the body once fetched) -- being the actual document is sufficient
    // on its own, it doesn't also need to clear the stricter ratio.
    const relevance = scoreRelevance(terms, "Illinois Constitution", "");
    expect(passesRelevanceGate(terms, relevance, { hasCanonicalTarget: true, isCanonicalMatch: true })).toBe(true);
  });

  it("rejects a constitutional-amendment proposal that shares only one incidental word -- the confirmed contamination case", () => {
    const relevance = scoreRelevance(terms, "Proposed Amendment on Legislative Veto Procedures", "");
    // Shares only "veto" (1 of 4 significant terms, ratio 0.25) -- a
    // proposal to change veto procedure, not the actual constitutional
    // text, and not the canonical match either.
    expect(relevance.ratio).toBeLessThan(0.5);
    expect(passesRelevanceGate(terms, relevance, { hasCanonicalTarget: true, isCanonicalMatch: false })).toBe(false);
  });

  it("rejects an unrelated bill that shares zero terms, same as the non-canonical-aware gate already would", () => {
    const relevance = scoreRelevance(terms, "Bill Status of HB4809 - Data Broker Registration", "");
    expect(passesRelevanceGate(terms, relevance, { hasCanonicalTarget: true, isCanonicalMatch: false })).toBe(false);
  });

  it("still accepts a genuinely substantive secondary source that clears the stricter ratio on its own merits", () => {
    // A law review article or news analysis actually discussing the
    // governor's veto power in real depth (not just a passing mention)
    // should still qualify, even though it isn't the canonical document
    // itself -- the stricter bar is about incidental overlap, not about
    // excluding every non-primary source outright.
    const relevance = scoreRelevance(terms, "Understanding the Illinois Governor's Constitutional Veto Power", "veto override power constitution");
    expect(relevance.ratio).toBeGreaterThanOrEqual(0.5);
    expect(passesRelevanceGate(terms, relevance, { hasCanonicalTarget: true, isCanonicalMatch: false })).toBe(true);
  });

  it("falls back to the original lenient one-term bar when there is no canonical target at all", () => {
    const relevance = scoreRelevance(terms, "Illinois Governor's Office Overview", "");
    // Matches only "governor" -- would fail the stricter 0.5 ratio, but
    // there's no canonical target here, so the original behavior applies.
    expect(passesRelevanceGate(terms, relevance, { hasCanonicalTarget: false, isCanonicalMatch: false })).toBe(
      relevance.matchedTerms.length > 0,
    );
  });
});

describe("rankingScore -- relevance is primary, authority only a tiebreaker", () => {
  it("ranks a highly relevant official page above an unrelated official page with HIGHER authority", () => {
    // The exact confirmed scenario: an on-topic page at a lower authority
    // rank must still outrank an unrelated page at a higher authority rank
    // (e.g. rank 75 "unclassified" data-broker page vs. rank 87
    // "state_legislature" campaign-finance page).
    const relevantButLowerAuthority = rankingScore({ matchedTerms: ["data", "broker"], ratio: 0.5, titleMatch: true }, 75);
    const irrelevantButHigherAuthority = rankingScore({ matchedTerms: [], ratio: 0, titleMatch: false }, 87);
    expect(relevantButLowerAuthority).toBeGreaterThan(irrelevantButHigherAuthority);
  });

  it("uses authority only to break ties between EQUALLY relevant candidates", () => {
    const sameRelevance = { matchedTerms: ["broker"], ratio: 0.3, titleMatch: false };
    const higherAuthority = rankingScore(sameRelevance, 87);
    const lowerAuthority = rankingScore(sameRelevance, 75);
    expect(higherAuthority).toBeGreaterThan(lowerAuthority);
    // The authority gap alone (12 points) must never be enough to flip the
    // ordering when relevance actually differs, even slightly.
    const slightlyMoreRelevantLowAuthority = rankingScore({ matchedTerms: ["broker", "data"], ratio: 0.301, titleMatch: false }, 10);
    expect(slightlyMoreRelevantLowAuthority).toBeGreaterThan(higherAuthority);
  });

  it("a title match outranks a body-only match at equal term-overlap ratio", () => {
    const titleMatch = rankingScore({ matchedTerms: ["broker"], ratio: 0.3, titleMatch: true }, 10);
    const bodyOnlyMatch = rankingScore({ matchedTerms: ["broker"], ratio: 0.3, titleMatch: false }, 10);
    expect(titleMatch).toBeGreaterThan(bodyOnlyMatch);
  });
});

import { describe, it, expect } from "vitest";
import { flagStaleFutureFraming } from "./temporal-framing";

const NOW = new Date(2026, 7, 8); // August 8, 2026 -- matches the confirmed live case's actual date.

describe("flagStaleFutureFraming -- the confirmed real-world case", () => {
  it("flags a deadline phrased as an upcoming obligation when that date has already passed", () => {
    const text = "Data brokers must begin processing these requests by August 1, 2026, and risk fines for non-compliance.";
    const { text: result, corrections } = flagStaleFutureFraming(text, NOW);
    expect(result).toBe(
      "Data brokers must begin processing these requests by August 1, 2026 (this August 1, 2026 date has already passed), and risk fines for non-compliance.",
    );
    expect(corrections).toEqual([{ date: "August 1, 2026", index: text.indexOf("August 1, 2026") }]);
  });

  it("flags an 'expected to be operational by' projection for a passed date", () => {
    const text = "The platform is expected to be fully operational by August 1, 2026.";
    const { text: result, corrections } = flagStaleFutureFraming(text, NOW);
    expect(result).toBe("The platform is expected to be fully operational by August 1, 2026 (this August 1, 2026 date has already passed).");
    expect(corrections.length).toBe(1);
  });

  it("flags a 'goes live beginning' projection for a passed date", () => {
    const text = "The DROP platform goes live in stages beginning January 1, 2026.";
    const { text: result, corrections } = flagStaleFutureFraming(text, NOW);
    expect(result).toBe(
      "The DROP platform goes live in stages beginning January 1, 2026 (this January 1, 2026 date has already passed).",
    );
    expect(corrections.length).toBe(1);
  });
});

describe("flagStaleFutureFraming -- does not touch a genuinely future date", () => {
  it("leaves a future deadline's projection language untouched", () => {
    const text = "Data brokers must begin processing these requests by August 1, 2027.";
    const { text: result, corrections } = flagStaleFutureFraming(text, NOW);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("leaves today's own date untouched (not strictly in the past)", () => {
    const text = "The requirement is set to take effect on August 8, 2026.";
    const { text: result, corrections } = flagStaleFutureFraming(text, NOW);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });
});

describe("flagStaleFutureFraming -- does not touch a legitimately past-framed date", () => {
  it("leaves a plain historical enactment date alone -- already correctly past tense", () => {
    const text = "The California Delete Act was signed into law on October 10, 2023.";
    const { text: result, corrections } = flagStaleFutureFraming(text, NOW);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("leaves a past date with no future-framing trigger phrase nearby alone", () => {
    const text = "Third-party audits began on January 1, 2026, covering the prior fiscal year.";
    const { text: result, corrections } = flagStaleFutureFraming(text, NOW);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });
});

describe("flagStaleFutureFraming -- safety boundaries", () => {
  it("does nothing when the text has no dates at all", () => {
    const text = "This response mentions no specific calendar dates.";
    expect(flagStaleFutureFraming(text, NOW)).toEqual({ text, corrections: [] });
  });

  it("ignores a bare year with no month/day -- can't confidently compare it to today", () => {
    const text = "Third-party audits will begin in 2028.";
    const { text: result, corrections } = flagStaleFutureFraming(text, NOW);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("ignores an invalid calendar date rather than guessing what it means", () => {
    const text = "The platform is expected to be operational by February 30, 2026.";
    const { text: result, corrections } = flagStaleFutureFraming(text, NOW);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("flags multiple stale dates independently in the same response", () => {
    const text =
      "The DROP platform goes live beginning January 1, 2026. Data brokers must begin processing requests by August 1, 2026.";
    const { corrections } = flagStaleFutureFraming(text, NOW);
    expect(corrections.map((c) => c.date)).toEqual(["January 1, 2026", "August 1, 2026"]);
  });
});

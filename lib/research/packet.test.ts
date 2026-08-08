import { describe, it, expect } from "vitest";
import { currentIllinoisGeneralAssembly } from "@/lib/intelligence/general-assembly";
import { computeConfidence, computeExpectedGeneralAssembly, type TieredSource } from "./packet";

function source(tier: TieredSource["tier"], provenance?: TieredSource["provenance"]): TieredSource {
  return { title: `a ${tier} source`, url: `https://example.com/${tier}-${Math.random()}`, tier, provenance };
}

describe("computeConfidence -- official sources must be the dominant component, not merely present", () => {
  it("does NOT rate High when mostly secondary sources are cited (1 gov / 4 secondary) -- the confirmed gap", () => {
    const sources = [source("government"), source("general"), source("general"), source("news"), source("reference")];
    expect(computeConfidence(sources, false)).not.toBe("high");
  });

  it("rates High when official sources make up at least half of what's cited (2 gov / 2 secondary)", () => {
    const sources = [source("government"), source("government"), source("general"), source("news")];
    expect(computeConfidence(sources, false)).toBe("high");
  });

  it("rates High when official sources are the clear majority (3 gov / 1 secondary)", () => {
    const sources = [source("government"), source("government"), source("government"), source("general")];
    expect(computeConfidence(sources, false)).toBe("high");
  });

  it("rates High for a direct gov-data-provider hit regardless of ratio", () => {
    const sources = [source("government"), source("general"), source("general"), source("general")];
    expect(computeConfidence(sources, true)).toBe("high");
  });

  it("still rates Medium for a single official source with no corroboration", () => {
    expect(computeConfidence([source("government")], false)).toBe("medium");
  });

  it("still rates Low with no sources at all", () => {
    expect(computeConfidence([], false)).toBe("low");
  });
});

describe("computeExpectedGeneralAssembly", () => {
  it("defaults to the current GA when the question names no session", () => {
    expect(computeExpectedGeneralAssembly("HB4809", "Illinois", [])).toBe(currentIllinoisGeneralAssembly());
  });

  it("uses the explicit session when the question names exactly one", () => {
    expect(computeExpectedGeneralAssembly("HB4809", "Illinois", [103])).toBe(103);
  });

  it("returns null (no expectation) when the question names two or more sessions -- a cross-session comparison", () => {
    // Confirmed gap: without this, comparing HB4809 across the 103rd and
    // 104th General Assemblies in one question would set the expectation
    // to whichever session sorted first, silently rejecting the other.
    expect(computeExpectedGeneralAssembly("HB4809", "Illinois", [103, 104])).toBeNull();
  });

  it("returns null when there is no bill number at all", () => {
    expect(computeExpectedGeneralAssembly(null, "Illinois", [104])).toBeNull();
  });

  it("returns null for a non-Illinois state", () => {
    expect(computeExpectedGeneralAssembly("HB100", "Texas", [])).toBeNull();
  });

  it("returns null when state is not yet resolved", () => {
    expect(computeExpectedGeneralAssembly("HB4809", null, [])).toBeNull();
  });
});

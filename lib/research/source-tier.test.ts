import { describe, it, expect } from "vitest";
import { sourceAuthorityRank, sourceTier } from "./source-tier";

describe("sourceAuthorityRank -- Attorney General classification", () => {
  it("ranks an Attorney General page alongside state agencies -- the confirmed gap", () => {
    // Previously fell to "unclassified" (75), below both state_agency (81)
    // and state_courts (79) -- the requested hierarchy groups "state
    // executive agencies or attorneys general" as one tier.
    const agRank = sourceAuthorityRank("https://oag.ca.gov/privacy/ccpa", "California Attorney General");
    const agencyRank = sourceAuthorityRank("https://dceo.illinois.gov", "Illinois Department of Commerce");
    const courtsRank = sourceAuthorityRank("https://illinoiscourts.gov", "Illinois Supreme Court");
    const statutesRank = sourceAuthorityRank("https://ilga.gov/legislation/ilcs", "Illinois Compiled Statutes");

    expect(agRank).toBe(agencyRank);
    expect(agRank).toBeGreaterThan(courtsRank);
    expect(agRank).toBeLessThan(statutesRank);
  });

  it("still tiers an Attorney General page as government-tier", () => {
    expect(sourceTier("https://oag.ca.gov/privacy/ccpa", "California Attorney General")).toBe("government");
  });
});

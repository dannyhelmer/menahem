import { describe, it, expect } from "vitest";
import type { PoliticalIntent } from "@/lib/intelligence/political-intent";
import { classifyJurisdictionRouting, selectOfficialDomains, STATE_OFFICIAL_DOMAINS, stateForDomain } from "./source-router";

function intentSet(...intents: PoliticalIntent[]): Set<PoliticalIntent> {
  return new Set(intents);
}

function allDomainsFor(state: string): string[] {
  const entry = STATE_OFFICIAL_DOMAINS[state];
  const legislature = Array.isArray(entry.legislature)
    ? entry.legislature
    : entry.legislature
      ? [entry.legislature]
      : [];
  return [
    ...legislature,
    ...(entry.agency ? [entry.agency] : []),
    ...(entry.courts ? [entry.courts] : []),
    ...(entry.attorneyGeneral ? [entry.attorneyGeneral] : []),
    ...(entry.elections ? [entry.elections] : []),
  ];
}

describe("STATE_OFFICIAL_DOMAINS", () => {
  it("never lists the same domain under two different states", () => {
    // A copy-paste error here would make the cross-state jurisdiction check
    // (stateForDomain, used to reject e.g. wvlegislature.gov for a Virginia
    // query) actively worse than not having it -- it would let a wrong-state
    // domain silently pass as "correct" instead of being rejected OR would
    // reject a genuinely correct domain because it's also claimed by another
    // state's entry.
    const seenBy = new Map<string, string>();
    const duplicates: string[] = [];
    for (const state of Object.keys(STATE_OFFICIAL_DOMAINS)) {
      for (const domain of allDomainsFor(state)) {
        const owner = seenBy.get(domain);
        if (owner && owner !== state) {
          duplicates.push(`${domain} claimed by both ${owner} and ${state}`);
        } else {
          seenBy.set(domain, state);
        }
      }
    }
    expect(duplicates).toEqual([]);
  });

  it("covers all 50 states with at least a legislature or agency domain", () => {
    const states = Object.keys(STATE_OFFICIAL_DOMAINS);
    expect(states.length).toBe(50);
    for (const state of states) {
      const entry = STATE_OFFICIAL_DOMAINS[state];
      expect(entry.legislature ?? entry.agency, `${state} has no legislature or agency domain`).toBeTruthy();
    }
  });
});

describe("stateForDomain", () => {
  it("resolves a known state domain to its state", () => {
    expect(stateForDomain("wvlegislature.gov")).toBe("West Virginia");
    expect(stateForDomain("virginiageneralassembly.gov")).toBe("Virginia");
    expect(stateForDomain("ilga.gov")).toBe("Illinois");
  });

  it("never flags an unmapped or generic domain", () => {
    expect(stateForDomain("congress.gov")).toBeNull();
    expect(stateForDomain("gov")).toBeNull();
    expect(stateForDomain("example.com")).toBeNull();
  });
});

describe("classifyJurisdictionRouting", () => {
  it("includes federal sources outright when jurisdiction is federal", () => {
    const routing = classifyJurisdictionRouting("What does H.R. 1 do?", intentSet("federal_legislation"), "federal", null);
    expect(routing.scope).toBe("federal");
    expect(routing.includeFederalSources).toBe(true);
    expect(routing.excludedFederalLabels).toEqual([]);
  });

  it("excludes federal sources for an ordinary state-legislation question -- the confirmed production bug", () => {
    // The exact shape of the bug: a state civil-asset-forfeiture question
    // whose text mentions "legislature", which used to trip the `congress`
    // PoliticalIntent (CONGRESS_RE matches the bare word) and silently pull
    // in congress.gov/house.gov/senate.gov/supremecourt.gov alongside the
    // correct state-specific domains.
    const text = "Compare how Texas and Illinois regulate civil asset forfeiture, including each state legislature's reforms.";
    const routing = classifyJurisdictionRouting(text, intentSet("congress", "state_legislation", "comparison"), "state", "Texas");
    expect(routing.scope).toBe("state");
    expect(routing.includeFederalSources).toBe(false);
    expect(routing.excludedFederalLabels).toEqual(
      expect.arrayContaining(["Congress.gov", "House.gov", "Senate.gov", "Supreme Court"]),
    );
  });

  it("excludes federal sources for local jurisdiction with no federal ask", () => {
    const routing = classifyJurisdictionRouting("What did the city council vote on?", intentSet("local_government"), "local", null);
    expect(routing.scope).toBe("local");
    expect(routing.includeFederalSources).toBe(false);
  });

  it("treats an explicit federal-law comparison as mixed, including federal sources alongside state ones", () => {
    const text = "How does Illinois's civil asset forfeiture law compare to federal law?";
    const routing = classifyJurisdictionRouting(text, intentSet("state_legislation", "comparison"), "state", "Illinois");
    expect(routing.scope).toBe("mixed");
    expect(routing.includeFederalSources).toBe(true);
    expect(routing.excludedFederalLabels).toEqual([]);
  });

  it("treats an explicit federal_legislation intent as an override even without the literal word 'federal' nearby", () => {
    const routing = classifyJurisdictionRouting(
      "What does Congress's H.R. 1 do compared to Illinois's version?",
      intentSet("federal_legislation", "state_legislation"),
      "state",
      "Illinois",
    );
    expect(routing.includeFederalSources).toBe(true);
  });
});

describe("selectOfficialDomains with jurisdiction routing", () => {
  it("never includes a federal domain for a state query with no explicit federal ask", () => {
    const text = "Texas civil asset forfeiture legislature reform";
    const intents = intentSet("congress", "state_legislation");
    const routing = classifyJurisdictionRouting(text, intents, "state", "Texas");
    const result = selectOfficialDomains(intents, routing, text);
    expect(result.domains).not.toEqual(
      expect.arrayContaining(["congress.gov", "house.gov", "senate.gov", "supremecourt.gov"]),
    );
    expect(result.domains).toEqual(expect.arrayContaining(["capitol.texas.gov", "texas.gov"]));
  });

  it("includes federal domains alongside state domains for an explicit federal comparison", () => {
    const text = "Compare Illinois civil asset forfeiture law to federal law";
    const intents = intentSet("state_legislation", "federal_legislation");
    const routing = classifyJurisdictionRouting(text, intents, "state", "Illinois");
    const result = selectOfficialDomains(intents, routing, text);
    expect(result.domains).toEqual(expect.arrayContaining(["congress.gov", "ilga.gov"]));
  });
});

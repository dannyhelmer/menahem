import { describe, it, expect } from "vitest";
import { STATE_OFFICIAL_DOMAINS, stateForDomain } from "./source-router";

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

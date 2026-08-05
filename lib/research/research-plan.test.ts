import { describe, it, expect } from "vitest";
import { parseResearchPlan } from "./research-plan";

const fallback = { jurisdiction: "federal" as const, state: null };

describe("parseResearchPlan", () => {
  it("parses a well-formed response with explicit entities -- the confirmed CCPA-style example", () => {
    const raw =
      "TOPIC: State consumer privacy law comparison\n" +
      "JURISDICTION: state\n" +
      "ENTITY_TYPE: statute\n" +
      "REQUEST_TYPE: comparison\n" +
      "REASONING: The question asks to compare state privacy laws without naming specific ones, so the " +
      "strongest known state privacy statutes are the relevant entities.\n" +
      "ENTITIES:\n" +
      "- California CCPA/CPRA | California\n" +
      "- Virginia VCDPA | Virginia\n" +
      "- Colorado Privacy Act | Colorado\n" +
      "- Connecticut CTDPA | Connecticut\n" +
      "- Utah UCPA | Utah\n";

    const plan = parseResearchPlan(raw, "Compare the five strongest state consumer privacy laws", fallback);
    expect(plan.topic).toBe("State consumer privacy law comparison");
    expect(plan.jurisdiction).toBe("state");
    expect(plan.entityType).toBe("statute");
    expect(plan.requestType).toBe("comparison");
    expect(plan.reasoning).toContain("strongest known state privacy statutes");
    expect(plan.entities).toEqual([
      { name: "California CCPA/CPRA", jurisdiction: "California" },
      { name: "Virginia VCDPA", jurisdiction: "Virginia" },
      { name: "Colorado Privacy Act", jurisdiction: "Colorado" },
      { name: "Connecticut CTDPA", jurisdiction: "Connecticut" },
      { name: "Utah UCPA", jurisdiction: "Utah" },
    ]);
  });

  it("falls back to defaults for an invalid JURISDICTION/ENTITY_TYPE/REQUEST_TYPE, without discarding the rest", () => {
    const raw =
      "TOPIC: Something\n" +
      "JURISDICTION: planetary\n" +
      "ENTITY_TYPE: spaceship\n" +
      "REQUEST_TYPE: whenever\n" +
      "REASONING: n/a\n" +
      "ENTITIES:\n";

    const plan = parseResearchPlan(raw, "some question", { jurisdiction: "state", state: "Texas" });
    expect(plan.topic).toBe("Something");
    expect(plan.jurisdiction).toBe("state"); // falls back to the caller's own resolved jurisdiction
    expect(plan.entityType).toBe("other");
    expect(plan.requestType).toBe("current_status");
    expect(plan.entities).toEqual([]);
  });

  it("treats a missing ENTITIES section as zero entities, not a parse failure", () => {
    const raw = "TOPIC: Something\nJURISDICTION: federal\nENTITY_TYPE: bill\nREQUEST_TYPE: enacted\nREASONING: n/a\n";
    const plan = parseResearchPlan(raw, "some question", fallback);
    expect(plan.topic).toBe("Something");
    expect(plan.entities).toEqual([]);
  });

  it("treats a bare federal marker (no '|') and an explicit 'federal' jurisdiction both as null jurisdiction", () => {
    const raw =
      "TOPIC: Federal bills\nJURISDICTION: federal\nENTITY_TYPE: bill\nREQUEST_TYPE: enacted\nREASONING: n/a\n" +
      "ENTITIES:\n- H.R. 1\n- S. 100 | federal\n";
    const plan = parseResearchPlan(raw, "some question", fallback);
    expect(plan.entities).toEqual([
      { name: "H.R. 1", jurisdiction: null },
      { name: "S. 100", jurisdiction: null },
    ]);
  });

  it("caps the entities list at MAX_RESEARCH_TASKS", () => {
    const entityLines = Array.from({ length: 10 }, (_, i) => `- Entity ${i} | State${i}`).join("\n");
    const raw = `TOPIC: Many things\nJURISDICTION: state\nENTITY_TYPE: statute\nREQUEST_TYPE: comparison\nREASONING: n/a\nENTITIES:\n${entityLines}\n`;
    const plan = parseResearchPlan(raw, "some question", fallback);
    expect(plan.entities.length).toBe(6);
    expect(plan.entities[0]).toEqual({ name: "Entity 0", jurisdiction: "State0" });
  });

  it("falls back entirely on completely unparseable text (no TOPIC line at all)", () => {
    const plan = parseResearchPlan("I cannot help with that.", "some question", { jurisdiction: "local", state: null });
    expect(plan).toEqual({
      topic: "some question",
      jurisdiction: "local",
      entityType: "other",
      requestType: "current_status",
      reasoning: "Planning response could not be parsed.",
      entities: [],
    });
  });

  it("is case-insensitive for enum fields", () => {
    const raw = "TOPIC: X\nJURISDICTION: Mixed\nENTITY_TYPE: Court_Case\nREQUEST_TYPE: Historical\nREASONING: n/a\nENTITIES:\n";
    const plan = parseResearchPlan(raw, "some question", fallback);
    expect(plan.jurisdiction).toBe("mixed");
    expect(plan.entityType).toBe("court_case");
    expect(plan.requestType).toBe("historical");
  });

  it("skips a malformed entity line with an empty name", () => {
    const raw = "TOPIC: X\nJURISDICTION: state\nENTITY_TYPE: statute\nREQUEST_TYPE: comparison\nREASONING: n/a\nENTITIES:\n- | California\n- Real Entity | Texas\n";
    const plan = parseResearchPlan(raw, "some question", fallback);
    expect(plan.entities).toEqual([{ name: "Real Entity", jurisdiction: "Texas" }]);
  });
});

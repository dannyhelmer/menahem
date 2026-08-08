import { describe, it, expect } from "vitest";
import { parseResearchPlan, verifyLowConfidenceEntities, type ResearchPlanEntity } from "./research-plan";

const fallback = { jurisdiction: "federal" as const, state: null };

describe("parseResearchPlan", () => {
  it("parses a well-formed response with explicit entities and confidence scores", () => {
    const raw =
      "TOPIC: State consumer privacy law comparison\n" +
      "JURISDICTION: state\n" +
      "ENTITY_TYPE: statute\n" +
      "REQUEST_TYPE: comparison\n" +
      "REASONING: The question asks to compare state privacy laws without naming specific ones, so the " +
      "strongest known state privacy statutes are the relevant entities.\n" +
      "ENTITIES:\n" +
      "- California CCPA/CPRA | California | 90\n" +
      "- Virginia VCDPA | Virginia | 85\n" +
      "- Colorado Privacy Act | Colorado | 80\n" +
      "- Connecticut CTDPA | Connecticut | 80\n" +
      "- Utah UCPA | Utah | 75\n";

    const plan = parseResearchPlan(raw, "Compare the five strongest state consumer privacy laws", fallback);
    expect(plan.topic).toBe("State consumer privacy law comparison");
    expect(plan.jurisdiction).toBe("state");
    expect(plan.entityType).toBe("statute");
    expect(plan.requestType).toBe("comparison");
    expect(plan.reasoning).toContain("strongest known state privacy statutes");
    expect(plan.entities).toEqual([
      { name: "California CCPA/CPRA", jurisdiction: "California", confidence: 90 },
      { name: "Virginia VCDPA", jurisdiction: "Virginia", confidence: 85 },
      { name: "Colorado Privacy Act", jurisdiction: "Colorado", confidence: 80 },
      { name: "Connecticut CTDPA", jurisdiction: "Connecticut", confidence: 80 },
      { name: "Utah UCPA", jurisdiction: "Utah", confidence: 75 },
    ]);
  });

  it("defaults confidence to 50 when the field is missing", () => {
    const raw = "TOPIC: X\nJURISDICTION: state\nENTITY_TYPE: statute\nREQUEST_TYPE: comparison\nREASONING: n/a\nENTITIES:\n- Some Law | Texas\n";
    const plan = parseResearchPlan(raw, "some question", fallback);
    expect(plan.entities).toEqual([{ name: "Some Law", jurisdiction: "Texas", confidence: 50 }]);
  });

  it("defaults confidence to 50 for an unparseable value and clamps out-of-range values", () => {
    const raw =
      "TOPIC: X\nJURISDICTION: state\nENTITY_TYPE: statute\nREQUEST_TYPE: comparison\nREASONING: n/a\nENTITIES:\n" +
      "- Law A | Texas | not-a-number\n" +
      "- Law B | Texas | 150\n" +
      "- Law C | Texas | -20\n";
    const plan = parseResearchPlan(raw, "some question", fallback);
    expect(plan.entities).toEqual([
      { name: "Law A", jurisdiction: "Texas", confidence: 50 },
      { name: "Law B", jurisdiction: "Texas", confidence: 100 },
      { name: "Law C", jurisdiction: "Texas", confidence: 0 },
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
      { name: "H.R. 1", jurisdiction: null, confidence: 50 },
      { name: "S. 100", jurisdiction: null, confidence: 50 },
    ]);
  });

  it("caps the entities list at MAX_RESEARCH_TASKS", () => {
    const entityLines = Array.from({ length: 10 }, (_, i) => `- Entity ${i} | State${i} | 60`).join("\n");
    const raw = `TOPIC: Many things\nJURISDICTION: state\nENTITY_TYPE: statute\nREQUEST_TYPE: comparison\nREASONING: n/a\nENTITIES:\n${entityLines}\n`;
    const plan = parseResearchPlan(raw, "some question", fallback);
    expect(plan.entities.length).toBe(6);
    expect(plan.entities[0]).toEqual({ name: "Entity 0", jurisdiction: "State0", confidence: 60 });
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
    const raw = "TOPIC: X\nJURISDICTION: state\nENTITY_TYPE: statute\nREQUEST_TYPE: comparison\nREASONING: n/a\nENTITIES:\n- | California\n- Real Entity | Texas | 70\n";
    const plan = parseResearchPlan(raw, "some question", fallback);
    expect(plan.entities).toEqual([{ name: "Real Entity", jurisdiction: "Texas", confidence: 70 }]);
  });
});

describe("verifyLowConfidenceEntities", () => {
  const highConfidence: ResearchPlanEntity = { name: "Vermont Data Broker Law", jurisdiction: "Vermont", confidence: 95 };

  it("leaves high-confidence entities untouched and never calls search for them", () => {
    let called = false;
    const fakeSearch = async () => {
      called = true;
      return { success: true, sources: [] };
    };
    return verifyLowConfidenceEntities([highConfidence], fakeSearch).then((result) => {
      expect(result).toEqual([highConfidence]);
      expect(called).toBe(false);
    });
  });

  it("verifies an entity exactly AT the threshold, not just strictly below it -- the confirmed flat-score case", async () => {
    // Confirmed live: the model sometimes assigns the SAME confidence to
    // every entity in a list (e.g. 70 across the board in one run, 80 in
    // another) instead of genuinely differentiating -- an exclusive "<"
    // comparison would let a flat score sitting exactly on the threshold
    // slip through unverified.
    const entity: ResearchPlanEntity = { name: "California Consumer Privacy Act", jurisdiction: "California", confidence: 85 };
    let called = false;
    const fakeSearch = async () => {
      called = true;
      return { success: true, sources: [] };
    };
    const result = await verifyLowConfidenceEntities([entity], fakeSearch);
    expect(called).toBe(true);
    expect(result).toEqual([]); // no confirming source -- dropped
  });

  it("keeps a low-confidence entity confirmed by a search result containing its distinctive words", async () => {
    // The confirmed real-world case: "California Consumer Privacy Act
    // (CCPA)" flagged low-confidence, and a search actually turns up a
    // page about the DELETE Act (distinctive word "delete" doesn't
    // overlap) -- vs. this test, where the search result genuinely is
    // about the named entity ("data broker" overlaps).
    const entity: ResearchPlanEntity = { name: "California Data Broker Registration Act", jurisdiction: "California", confidence: 40 };
    const fakeSearch = async () => ({
      success: true,
      sources: [{ title: "California Data Broker Registry - Attorney General", url: "https://oag.ca.gov/data-brokers" }],
    });
    const result = await verifyLowConfidenceEntities([entity], fakeSearch);
    expect(result).toEqual([entity]);
  });

  it("drops a low-confidence entity when the search finds nothing confirming it -- the confirmed CCPA-substitution case", async () => {
    const entity: ResearchPlanEntity = { name: "California Consumer Privacy Act (CCPA)", jurisdiction: "California", confidence: 30 };
    // Search returns real results, but none of them are actually about
    // THIS entity -- e.g. generic state government pages that only share
    // the jurisdiction name, not any distinctive word from the entity name.
    const fakeSearch = async () => ({
      success: true,
      sources: [{ title: "California State Government Organizational Chart", url: "https://ca.gov/org-chart" }],
    });
    const result = await verifyLowConfidenceEntities([entity], fakeSearch);
    expect(result).toEqual([]);
  });

  it("drops a low-confidence entity when the search returns no sources at all", async () => {
    const entity: ResearchPlanEntity = { name: "Nonexistent State Law", jurisdiction: "Texas", confidence: 20 };
    const fakeSearch = async () => ({ success: false, sources: [] });
    const result = await verifyLowConfidenceEntities([entity], fakeSearch);
    expect(result).toEqual([]);
  });

  it("keeps a low-confidence entity when the verification search itself throws -- unknown, not disproven", async () => {
    const entity: ResearchPlanEntity = { name: "Some Law", jurisdiction: "Texas", confidence: 25 };
    const fakeSearch = async () => {
      throw new Error("network error");
    };
    const result = await verifyLowConfidenceEntities([entity], fakeSearch);
    expect(result).toEqual([entity]);
  });

  it("verifies multiple low-confidence entities independently, keeping some and dropping others", async () => {
    const good: ResearchPlanEntity = { name: "Vermont Data Broker Law", jurisdiction: "Vermont", confidence: 50 };
    const bad: ResearchPlanEntity = { name: "Texas Privacy Protection Act", jurisdiction: "Texas", confidence: 40 };
    const fakeSearch = async (query: string) => {
      if (query.includes("Vermont")) {
        return { success: true, sources: [{ title: "Data Broker Registration | Vermont Attorney General", url: "https://ago.vermont.gov/data-brokers" }] };
      }
      // No overlap with "Texas Privacy Protection Act"'s distinctive words
      // ("privacy", "protection") -- a real result, just not about this entity.
      return { success: true, sources: [{ title: "Texas Department of Motor Vehicles Registration", url: "https://texas.gov/dmv" }] };
    };
    const result = await verifyLowConfidenceEntities([good, bad], fakeSearch);
    expect(result).toEqual([good]);
  });

  it("returns an empty list unchanged", async () => {
    const result = await verifyLowConfidenceEntities([], async () => ({ success: true, sources: [] }));
    expect(result).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { currentIllinoisGeneralAssembly, extractAllGeneralAssemblies, extractGeneralAssembly, isGeneralAssemblyMismatch } from "./general-assembly";

describe("currentIllinoisGeneralAssembly", () => {
  it("computes the confirmed live values -- 2024 is the 103rd GA, 2026 is the 104th", () => {
    expect(currentIllinoisGeneralAssembly(new Date("2024-04-16"))).toBe(103);
    expect(currentIllinoisGeneralAssembly(new Date("2026-02-06"))).toBe(104);
  });

  it("computes the anchor year correctly", () => {
    expect(currentIllinoisGeneralAssembly(new Date("2017-06-01"))).toBe(100);
  });

  it("stays within the same GA across both years of its term", () => {
    expect(currentIllinoisGeneralAssembly(new Date("2025-01-15"))).toBe(104);
    expect(currentIllinoisGeneralAssembly(new Date("2026-12-31"))).toBe(104);
  });
});

describe("extractGeneralAssembly", () => {
  it("extracts a GA number stated in text", () => {
    expect(extractGeneralAssembly("Illinois General Assembly - 104th General Assembly")).toBe(104);
    expect(extractGeneralAssembly("Bill status under the 103rd General Assembly")).toBe(103);
  });

  it("is case-insensitive", () => {
    expect(extractGeneralAssembly("104th general assembly")).toBe(104);
  });

  it("returns null when no General Assembly is mentioned", () => {
    expect(extractGeneralAssembly("Illinois General Assembly - Bill Status of HB4809")).toBeNull();
    expect(extractGeneralAssembly("")).toBeNull();
  });

  it("matches the plural 'General Assemblies' too, not just singular 'Assembly'", () => {
    // Confirmed gap: a question comparing two sessions in one breath uses
    // the shared plural noun ("the 103rd and 104th General Assemblies"),
    // not "General Assembly" twice -- the original singular-only pattern
    // matched neither ordinal in that phrasing.
    expect(extractGeneralAssembly("What changed between the 103rd and 104th General Assemblies?")).toBe(103);
  });
});

describe("extractAllGeneralAssemblies", () => {
  it("extracts every session number sharing one plural 'General Assemblies' noun", () => {
    expect(extractAllGeneralAssemblies("Compare HB4809 in the 103rd and 104th General Assemblies.")).toEqual([103, 104]);
  });

  it("extracts a single session for the singular 'General Assembly' phrasing", () => {
    expect(extractAllGeneralAssemblies("What happened to HB4809 in the 103rd General Assembly?")).toEqual([103]);
  });

  it("deduplicates and sorts ascending across multiple mentions in any order", () => {
    expect(extractAllGeneralAssemblies("The 104th General Assembly revisited a bill from the 103rd General Assembly.")).toEqual([
      103, 104,
    ]);
  });

  it("returns an empty array when no session is mentioned", () => {
    expect(extractAllGeneralAssemblies("What is the current status of HB4809?")).toEqual([]);
  });
});

describe("isGeneralAssemblyMismatch -- the confirmed HB4809 103rd-vs-104th collision", () => {
  // A current bill: HB4809 in the 104th GA, still pending -- the Data
  // Broker Registration and Accessible Deletion Mechanism Act, introduced
  // Feb 2026, referred to the Rules Committee. Confirmed live against the
  // real ilga.gov Bill Status page.
  const currentBillPage =
    "Illinois General Assembly - Bill Status of HB4809 - 104th General Assembly. " +
    "Referred to Rules Committee 2/6/2026. Data Broker Registration and Accessible Deletion Mechanism Act.";
  // An older bill: HB4809 in the 103rd GA -- a completely different,
  // already-enacted bill (passed the House April 2024). Confirmed live
  // that a fetched record for this exact bill got conflated with the
  // current one in a live response before this fix.
  const olderBillPage =
    "Illinois General Assembly - Bill Status of HB4809 - 103rd General Assembly. " +
    "Passed House 108-0-10 on 4/16/2024. Became Public Act 103-0555.";

  it("does NOT flag the current bill's own record as a mismatch against itself", () => {
    expect(isGeneralAssemblyMismatch(currentBillPage, 104)).toBe(false);
  });

  it("flags the older (103rd GA) bill's record as a mismatch when expecting the current (104th) GA", () => {
    expect(isGeneralAssemblyMismatch(olderBillPage, 104)).toBe(true);
  });

  it("flags the current (104th GA) bill's record as a mismatch when the question explicitly asked about the 103rd", () => {
    // The reverse case -- confirms this isn't just "newer always wins", it's
    // genuinely tied to whatever the caller expects.
    expect(isGeneralAssemblyMismatch(currentBillPage, 103)).toBe(true);
  });

  it("does not flag a page that never states its General Assembly at all -- fail open, not closed", () => {
    // Many legitimate secondary sources (news articles, law firm blogs)
    // never state the session explicitly -- silence must never be treated
    // as evidence of a wrong bill, the same fail-open design as the
    // existing cross-state domain check.
    const secondarySource = "Illinois lawmakers advance HB4809, a bill requiring data broker registration.";
    expect(isGeneralAssemblyMismatch(secondarySource, 104)).toBe(false);
  });
});

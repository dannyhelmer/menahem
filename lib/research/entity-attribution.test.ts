import { describe, it, expect } from "vitest";
import { enforceCaliforniaDataBrokerAttribution } from "./entity-attribution";

describe("enforceCaliforniaDataBrokerAttribution -- the confirmed real-world case", () => {
  it("annotates DROP and data-broker registration misattributed to a '## ... CCPA' section", () => {
    const text =
      "## California Consumer Privacy Act (CCPA)\n\n" +
      "The California Consumer Privacy Act (CCPA), enacted in 2018, significantly shapes consumer data rights.\n\n" +
      "Under the CCPA, data brokers are required to comply with specific requirements, including:\n\n" +
      "1. **Registration Requirements**: Data brokers must register annually with the California Privacy Protection Agency (CalPPA).\n" +
      "2. **Deletion Mechanism**: The DELETE Request and Opt-Out Platform (DROP) allows consumers to request data deletion across all registered brokers.\n\n" +
      "## New York SHIELD Act\n\nSome unrelated New York content.\n";

    const { text: result, corrections } = enforceCaliforniaDataBrokerAttribution(text);

    expect(result).toContain(
      "1. **Registration Requirements**: Data brokers must register annually with the California Privacy Protection Agency (CPPA). " +
        "(this is a provision of California's Delete Act, SB 362 -- not the CCPA/CPRA)",
    );
    expect(result).toContain(
      "2. **Deletion Mechanism**: The DELETE Request and Opt-Out Platform (DROP) allows consumers to request data deletion across all registered brokers. " +
        "(this is a provision of California's Delete Act, SB 362 -- not the CCPA/CPRA)",
    );
    // CalPPA -> CPPA correction applied too.
    expect(result).not.toContain("CalPPA");
    expect(result).toContain("(CPPA)");
    // New York's unrelated section is untouched.
    expect(result).toContain("## New York SHIELD Act\n\nSome unrelated New York content.");

    expect(corrections).toEqual(
      expect.arrayContaining([
        { section: "California Consumer Privacy Act (CCPA)", kind: "ccpa-delete-act-misattribution", count: 2 },
        { section: "(whole response)", kind: "cpp-agency-name", count: 1 },
      ]),
    );
  });
});

describe("enforceCaliforniaDataBrokerAttribution -- single-question responses (no '##' headings)", () => {
  it("catches the same misattribution when the whole response is about the CCPA, no multi-part headings", () => {
    const text =
      "**Official Title:** California Consumer Privacy Act (CCPA)\n\n" +
      "### Overview\n" +
      "The CCPA requires data brokers to register with the California Privacy Protection Agency (CalPPA) and " +
      "provides the DROP deletion mechanism for consumers.\n";

    const { text: result, corrections } = enforceCaliforniaDataBrokerAttribution(text);

    expect(result).toContain(
      "The CCPA requires data brokers to register with the California Privacy Protection Agency (CPPA) and " +
        "provides the DROP deletion mechanism for consumers. (this is a provision of California's Delete Act, SB 362 -- not the CCPA/CPRA)",
    );
    expect(corrections).toEqual(
      expect.arrayContaining([{ section: "(single section)", kind: "ccpa-delete-act-misattribution", count: 1 }]),
    );
  });
});

describe("enforceCaliforniaDataBrokerAttribution -- does not touch a section already correctly scoped", () => {
  it("leaves DROP/registration content untouched when the section is already headed as the Delete Act", () => {
    const text =
      "## California Delete Act (SB 362)\n\n" +
      "The Delete Act requires data brokers to register annually with the California Privacy Protection Agency (CPPA) " +
      "and establishes the DROP deletion mechanism.\n";
    const { text: result, corrections } = enforceCaliforniaDataBrokerAttribution(text);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("leaves a section about a different state untouched", () => {
    const text = "## Texas Data Broker Law\n\nTexas requires data brokers to register with the Secretary of State.\n";
    const { text: result, corrections } = enforceCaliforniaDataBrokerAttribution(text);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("leaves genuine CCPA content untouched when it never mentions DROP or data-broker registration", () => {
    const text =
      "## California Consumer Privacy Act (CCPA)\n\n" +
      "The CCPA grants California consumers the right to know, delete, and opt out of the sale of their personal " +
      "information, and prohibits discrimination against consumers who exercise these rights.\n";
    const { text: result, corrections } = enforceCaliforniaDataBrokerAttribution(text);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });
});

describe("enforceCaliforniaDataBrokerAttribution -- CalPPA correction applies globally", () => {
  it("corrects CalPPA to CPPA even outside a CCPA-headed section", () => {
    const text = "## California Delete Act (SB 362)\n\nData brokers register with CalPPA annually.\n";
    const { text: result, corrections } = enforceCaliforniaDataBrokerAttribution(text);
    expect(result).toContain("register with CPPA annually");
    expect(corrections).toEqual([{ section: "(whole response)", kind: "cpp-agency-name", count: 1 }]);
  });
});

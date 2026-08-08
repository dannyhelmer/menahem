import { describe, it, expect } from "vitest";
import { enforceAttributedClaims } from "./unsupported-claims";

function billText(supporters: string, critics: string, impact: string): string {
  return (
    "**Official Title:** Data Broker Registration and Accessible Deletion Mechanism Act\n" +
    "**Bill Number:** HB4809\n" +
    "**Current Status:** Introduced\n\n" +
    "### Overview\nThe bill would require data brokers to register.\n\n" +
    "---\n\n" +
    `**Supporters Argue:**  \n${supporters}\n\n` +
    "---\n\n" +
    `**Critics Argue:**  \n${critics}\n\n` +
    "---\n\n" +
    "**Why It Matters:**\n\n" +
    "**Who Is Affected:**\n- Data Brokers\n- Consumers\n\n" +
    `**Potential Impact:**  \n${impact}\n\n` +
    "---\n\n" +
    "**Verification:**  \n- Confirmed against the official record.\n"
  );
}

describe("enforceAttributedClaims -- the confirmed HB4809 real-world case", () => {
  it("replaces zero-attribution Supporters/Critics Argue text with an honest not-found statement", () => {
    const text = billText(
      "Supporters argued that the bill would enhance consumer privacy and control over personal data by allowing individuals to directly manage what information data brokers can retain about them.",
      "Critics expressed concerns about the effectiveness of the enforcement mechanisms and questioned whether the bill would adequately protect consumer information as intended.",
      "The legislation could significantly affect how data brokers operate in Illinois by imposing stricter registration and compliance requirements.",
    );
    const { text: result, corrections } = enforceAttributedClaims(text);

    expect(result).toContain("No supporter statements for this bill were found in retrieved sources.");
    expect(result).toContain("No critic statements for this bill were found in retrieved sources.");
    expect(result).not.toContain("Supporters argued that the bill would enhance consumer privacy");
    expect(result).not.toContain("Critics expressed concerns about the effectiveness");
    expect(corrections).toEqual(
      expect.arrayContaining([
        { section: "(single section)", field: "Supporters Argue", action: "replaced" },
        { section: "(single section)", field: "Critics Argue", action: "replaced" },
      ]),
    );
  });

  it("labels an unattributed Potential Impact as policy analysis rather than removing it", () => {
    const text = billText(
      "Supporters argued that the bill would enhance consumer privacy.",
      "Critics expressed concerns about enforcement.",
      "The legislation could significantly affect how data brokers operate in Illinois.",
    );
    const { text: result, corrections } = enforceAttributedClaims(text);

    expect(result).toContain(
      "**Policy Analysis (inference from the bill's own provisions -- not a reported or projected impact from a retrieved source):** The legislation could significantly affect how data brokers operate in Illinois.",
    );
    expect(corrections).toContainEqual({ section: "(single section)", field: "Potential Impact", action: "labeled" });
  });
});

describe("enforceAttributedClaims -- does not touch genuinely attributed claims", () => {
  it("leaves Supporters/Critics Argue untouched when a named venue or organization is present", () => {
    const text = billText(
      "Supporters argued in committee testimony that the bill would close a major privacy loophole (Illinois Chamber of Commerce statement).",
      "Critics testified before the Rules Committee that the enforcement mechanism was too weak.",
      "According to the Congressional Budget Office, similar registration regimes have reduced complaint volume in other states.",
    );
    const { text: result, corrections } = enforceAttributedClaims(text);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("leaves a Potential Impact citing a named source untouched", () => {
    const text = billText(
      "Supporters argued in a public statement that the bill would enhance consumer privacy.",
      "Critics noted in committee hearing testimony that enforcement funding was unclear.",
      "According to the Illinois Attorney General's office, the registration requirement mirrors California's framework.",
    );
    const { text: result, corrections } = enforceAttributedClaims(text);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });
});

describe("enforceAttributedClaims -- safety boundaries", () => {
  it("does nothing when the response has no Supporters/Critics Argue/Potential Impact fields at all", () => {
    const text = "### Overview\nThis is a plain answer with no legislative-summary template fields.";
    const { text: result, corrections } = enforceAttributedClaims(text);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });

  it("does nothing when a field is empty", () => {
    const text = billText("", "", "");
    const { text: result, corrections } = enforceAttributedClaims(text);
    expect(result).toBe(text);
    expect(corrections).toEqual([]);
  });
});

describe("enforceAttributedClaims -- per-section scoping in multi-part comparisons", () => {
  it("corrects only the unattributed section, leaving a genuinely attributed section untouched", () => {
    const text =
      "## Illinois\n\n" +
      "**Bill Number:** HB4809\n\n" +
      "**Supporters Argue:**  \nSupporters argued that the bill would improve consumer privacy.\n\n" +
      "---\n\n" +
      "**Critics Argue:**  \nCritics questioned the bill's enforcement mechanism.\n\n" +
      "## California\n\n" +
      "**Official Title:** California Delete Act\n\n" +
      "**Supporters Argue:**  \nSupporters argued in a public statement that the Delete Act simplifies opt-outs.\n\n" +
      "---\n\n" +
      "**Critics Argue:**  \nCritics noted in committee hearing testimony that compliance costs for small brokers were unclear.\n";

    const { text: result, corrections } = enforceAttributedClaims(text);

    expect(result).toContain("No supporter statements for this bill were found in retrieved sources.");
    expect(result).toContain("No critic statements for this bill were found in retrieved sources.");
    // California's section is genuinely attributed -- untouched.
    expect(result).toContain("Supporters argued in a public statement that the Delete Act simplifies opt-outs.");
    expect(result).toContain("Critics noted in committee hearing testimony that compliance costs for small brokers were unclear.");
    expect(corrections).toEqual([
      { section: "Illinois", field: "Supporters Argue", action: "replaced" },
      { section: "Illinois", field: "Critics Argue", action: "replaced" },
    ]);
  });
});

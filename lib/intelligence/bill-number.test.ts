import { describe, it, expect } from "vitest";
import { extractBillNumber, extractAllBillNumbers } from "./bill-number";

describe("extractBillNumber", () => {
  it("normalizes abbreviated and spelled-out forms to the same code", () => {
    expect(extractBillNumber("What is the status of House Bill 312?")).toBe("HB312");
    expect(extractBillNumber("What is the status of HB 312?")).toBe("HB312");
    expect(extractBillNumber("What is the status of H.B. 312?")).toBe("HB312");
  });

  it("never collapses chamber -- SB and HB stay distinct", () => {
    expect(extractBillNumber("Senate Bill 100")).toBe("SB100");
    expect(extractBillNumber("House Bill 100")).toBe("HB100");
    expect(extractBillNumber("SB 100")).not.toBe(extractBillNumber("HB 100"));
  });

  it("handles federal resolution forms without truncating to the bare chamber letter", () => {
    expect(extractBillNumber("H.Con.Res. 58")).toBe("HCONRES58");
    expect(extractBillNumber("H.R. 1")).toBe("HR1");
    expect(extractBillNumber("S.J.Res. 10")).toBe("SJRES10");
  });

  it("handles a bare chamber-letter shorthand (e.g. Vermont's H.847 convention)", () => {
    expect(extractBillNumber("What is the bill status of Vermont H.847?")).toBe("H847");
  });

  it("returns null for a question naming no specific bill", () => {
    expect(extractBillNumber("What are Illinois's civil asset forfeiture laws in general?")).toBeNull();
  });
});

describe("extractAllBillNumbers", () => {
  it("finds every bill identifier mentioned in a page's text", () => {
    const text = "This page discusses HB 312 and, separately, SB 100 and H.R. 1.";
    expect(extractAllBillNumbers(text)).toEqual(["HB312", "SB100", "HR1"]);
  });

  it("returns an empty array when no bill is mentioned", () => {
    expect(extractAllBillNumbers("General discussion of civil asset forfeiture policy.")).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { formatSettlementStatusLabel } from "./display-status";

describe("formatSettlementStatusLabel", () => {
  it("maps DB partial to Partially paid", () => {
    expect(formatSettlementStatusLabel("partial")).toBe("Partially paid");
  });
});

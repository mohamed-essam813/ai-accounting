import { describe, it, expect } from "vitest";
import { INV_NUMBER_PATTERN } from "./receipt-allocation-inference";

describe("INV reference pattern for receipt inference", () => {
  it("matches Ref: INV-2026-0017 style text", () => {
    const t = "Counterparty: Mostafa & Co | Invoice #: INV-2026-0017";
    const m = t.match(INV_NUMBER_PATTERN);
    expect(m?.[0].replace(/[–]/g, "-")).toBe("INV-2026-0017");
  });
});

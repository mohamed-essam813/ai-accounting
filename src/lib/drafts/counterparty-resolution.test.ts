import { describe, it, expect } from "vitest";
import { counterpartyNamesDiffer, normalizeCounterpartyLabel } from "./counterparty-resolution";

describe("counterpartyNamesDiffer", () => {
  it("treats punctuation variants as same", () => {
    expect(counterpartyNamesDiffer("M/s oxford", "M/s Oxford")).toBe(false);
  });

  it("detects real differences", () => {
    expect(counterpartyNamesDiffer("Chemlon Trading", "M/s oxford")).toBe(true);
  });
});

describe("normalizeCounterpartyLabel", () => {
  it("folds case and strips noise", () => {
    expect(normalizeCounterpartyLabel("  M/s  Oxford!!! ")).toBe("m s oxford");
  });
});

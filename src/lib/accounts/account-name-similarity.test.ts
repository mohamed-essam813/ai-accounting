import { describe, expect, it } from "vitest";
import {
  accountNameSimilarityScore,
  findSimilarAccountOptions,
  DUPLICATE_WARNING_SCORE,
} from "./account-name-similarity";

const sample = [
  { id: "1", name: "Freight Expense", code: "5300", type: "expense" },
  { id: "2", name: "Rent Expense", code: "5400", type: "expense" },
  { id: "3", name: "Delivery Expense", code: "5310", type: "expense" },
];

describe("accountNameSimilarityScore", () => {
  it("scores exact normalized match as 1", () => {
    expect(accountNameSimilarityScore("Freight Expense", "freight expense")).toBe(1);
  });

  it("scores high for substring overlap", () => {
    expect(accountNameSimilarityScore("Freight", "Freight Expense")).toBeGreaterThan(0.85);
  });
});

describe("findSimilarAccountOptions", () => {
  it("returns Delivery Expense for query Delivery when no substring row matches typed term only", () => {
    const q = "Delivery";
    const subs = sample.filter(
      (a) => a.name.toLowerCase().includes(q.toLowerCase()) || a.code.toLowerCase().includes(q.toLowerCase()),
    );
    expect(subs.length).toBeGreaterThan(0);
    const sim = findSimilarAccountOptions("Delivry", sample, 0.35, 3);
    expect(sim.some((s) => s.option.name.includes("Delivery"))).toBe(true);
  });

  it("duplicate threshold constant is stable", () => {
    expect(DUPLICATE_WARNING_SCORE).toBeGreaterThan(0.8);
  });
});

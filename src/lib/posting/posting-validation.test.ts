import { describe, it, expect } from "vitest";
import { validatePostingDateNotFuture } from "./validate-posting";
import { computeVatFromRate, isBalanced, round2 } from "./posting-engine";

describe("validatePostingDateNotFuture", () => {
  it("rejects future dates", () => {
    const r = validatePostingDateNotFuture("2099-12-31");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/future/i);
  });

  it("accepts today", () => {
    const t = new Date();
    const r = validatePostingDateNotFuture(t.toISOString().slice(0, 10));
    expect(r.ok).toBe(true);
  });
});

describe("posting-engine guards", () => {
  it("detects unbalanced journal", () => {
    expect(isBalanced([100], [99])).toBe(false);
    expect(isBalanced([100, 20], [120])).toBe(true);
  });

  it("round2 is stable", () => {
    expect(round2(1.016)).toBe(1.02);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it("inclusive tax splits to net + tax", () => {
    const r = computeVatFromRate(120, 20, "inclusive");
    expect(r.gross).toBe(120);
    expect(r.net).toBe(100);
    expect(r.tax).toBe(20);
  });
});

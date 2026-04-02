import { describe, it, expect } from "vitest";
import { computeVatFromRate, isBalanced, round2 } from "./posting-engine";

describe("computeVatFromRate", () => {
  it("service invoice, tax exclusive", () => {
    const r = computeVatFromRate(100, 20, "exclusive");
    expect(r.net).toBe(100);
    expect(r.tax).toBe(20);
    expect(r.gross).toBe(120);
  });

  it("service invoice, tax inclusive", () => {
    const r = computeVatFromRate(120, 20, "inclusive");
    expect(r.gross).toBe(120);
    expect(r.net).toBe(100);
    expect(r.tax).toBe(20);
  });

  it("inventory invoice, tax exclusive", () => {
    const r = computeVatFromRate(200, 10, "exclusive");
    expect(r.net).toBe(200);
    expect(r.tax).toBe(20);
    expect(r.gross).toBe(220);
  });

  it("inventory invoice, tax inclusive", () => {
    const r = computeVatFromRate(110, 10, "inclusive");
    expect(round2(r.gross)).toBe(110);
    expect(r.net).toBe(100);
    expect(r.tax).toBe(10);
  });

  it("zero-tax invoice", () => {
    const r = computeVatFromRate(50, 0, "exclusive");
    expect(r.tax).toBe(0);
    expect(r.gross).toBe(50);
    expect(r.net).toBe(50);
  });

  it("expense bill, tax exclusive", () => {
    const r = computeVatFromRate(80, 15, "exclusive");
    expect(r.net).toBe(80);
    expect(r.tax).toBe(12);
    expect(r.gross).toBe(92);
  });

  it("expense bill, tax inclusive", () => {
    const r = computeVatFromRate(115, 15, "inclusive");
    expect(r.gross).toBe(115);
    expect(r.net).toBe(100);
    expect(r.tax).toBe(15);
  });
});

describe("isBalanced", () => {
  it("detects balanced journal", () => {
    expect(isBalanced([100, 20], [120])).toBe(true);
    expect(isBalanced([100], [99])).toBe(false);
  });
});

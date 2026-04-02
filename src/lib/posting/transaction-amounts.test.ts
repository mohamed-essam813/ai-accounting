import { describe, it, expect } from "vitest";
import { buildTransactionAmounts, validateTransactionAmountsMatch } from "./transaction-amounts";

describe("transaction-amounts", () => {
  it("Expense – Exclusive", () => {
    const a = buildTransactionAmounts({ entered_amount: 100, tax_rate: 15, tax_treatment: "exclusive" });
    expect(a.subtotal_amount).toBe(100);
    expect(a.tax_amount).toBe(15);
    expect(a.total_amount).toBe(115);
  });

  it("Expense – Inclusive", () => {
    const a = buildTransactionAmounts({ entered_amount: 115, tax_rate: 15, tax_treatment: "inclusive" });
    expect(a.total_amount).toBe(115);
    expect(a.subtotal_amount).toBe(100);
    expect(a.tax_amount).toBe(15);
  });

  it("Inventory – Exclusive", () => {
    const a = buildTransactionAmounts({ entered_amount: 200, tax_rate: 10, tax_treatment: "exclusive" });
    expect(a.subtotal_amount).toBe(200);
    expect(a.tax_amount).toBe(20);
    expect(a.total_amount).toBe(220);
  });

  it("Inventory – Inclusive", () => {
    const a = buildTransactionAmounts({ entered_amount: 110, tax_rate: 10, tax_treatment: "inclusive" });
    expect(a.total_amount).toBe(110);
    expect(a.subtotal_amount).toBe(100);
    expect(a.tax_amount).toBe(10);
  });

  it("Tax mismatch blocking", () => {
    const expected = buildTransactionAmounts({ entered_amount: 100, tax_rate: 20, tax_treatment: "exclusive" });
    const provided = { ...expected, tax_amount: 19 };
    const r = validateTransactionAmountsMatch(expected, provided);
    expect(r.ok).toBe(false);
  });
});


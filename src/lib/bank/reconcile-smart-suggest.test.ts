import { describe, it, expect } from "vitest";
import { getSmartSuggestion } from "./reconcile-smart-suggest";

describe("getSmartSuggestion", () => {
  it("suggests bank charges for IPS fee text (money out)", () => {
    const r = getSmartSuggestion("Outward IPS Credit Transaction Charges", -0.58);
    expect(r.primaryKind).toBe("expense");
    expect(r.inlineLabel).toMatch(/Bank charges|Expense/i);
  });

  it("suggests salaries for payroll (money out)", () => {
    const r = getSmartSuggestion("Mudud Payroll Processing", -86086.22);
    expect(r.primaryKind).toBe("expense");
    expect(r.preferredAccountName).toMatch(/Salaries/i);
  });
});

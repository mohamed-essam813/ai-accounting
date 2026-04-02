import { describe, expect, it } from "vitest";
import {
  classificationToPlSection,
  legacyInferPlSection,
  pnlClassificationOptionsForType,
} from "./account-classification";

describe("account-classification", () => {
  it("maps DB classification to P&L sections", () => {
    expect(classificationToPlSection("cost_of_sales")).toBe("cost_of_sales");
    expect(classificationToPlSection("operating_expense")).toBe("operating_expenses");
    expect(classificationToPlSection("other_expense")).toBe("gain_loss");
  });

  it("legacy fallback does not treat all 5000-range codes as COGS", () => {
    const consulting = legacyInferPlSection({
      code: "5000",
      type: "expense",
      name: "Consulting Expense",
    });
    expect(consulting).toBe("operating_expenses");
    const cogs = legacyInferPlSection({
      code: "5500",
      type: "expense",
      name: "Cost of Goods Sold",
    });
    expect(cogs).toBe("cost_of_sales");
  });

  it("exposes revenue vs expense P&L options", () => {
    expect(pnlClassificationOptionsForType("revenue")).toContain("other_income");
    expect(pnlClassificationOptionsForType("expense")).toContain("cost_of_sales");
    expect(pnlClassificationOptionsForType("asset")).toEqual([]);
  });
});

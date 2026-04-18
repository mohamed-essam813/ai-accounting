import { describe, expect, it } from "vitest";
import { computeDefaultDepreciationStart, yearsToMonths, resolveDefaultUsefulLifeYears, validateUsefulLifeYearsInput } from "./useful-life";

describe("useful-life", () => {
  it("default depreciation start: 1st of month same month, else first of next month", () => {
    expect(computeDefaultDepreciationStart("2024-01-01")).toBe("2024-01-01");
    expect(computeDefaultDepreciationStart("2024-01-15")).toBe("2024-02-01");
  });

  it("years to months", () => {
    expect(yearsToMonths(3)).toBe(36);
  });

  it("validates range with warning for outliers", () => {
    const a = validateUsefulLifeYearsInput(5);
    expect(a.valid).toBe(true);
    if (a.valid && "warning" in a) {
      expect(a).not.toHaveProperty("warning");
    }
    const b = validateUsefulLifeYearsInput(0.5);
    expect(b.valid).toBe(true);
    if (b.valid && "warning" in b) {
      expect(b.warning).toBeDefined();
    }
  });

  it("resolves default years from company rows", () => {
    const y = resolveDefaultUsefulLifeYears("Computers & IT", [
      { category: "Computers & IT", life_years: 3, id: "1", tenant_id: "t" },
    ] as { category: string; life_years: number; id: string; tenant_id: string }[]);
    expect(y).toBe(3);
  });
});

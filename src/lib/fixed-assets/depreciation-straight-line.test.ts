import { describe, expect, it } from "vitest";
import { computeStraightLineForPeriod, straightLineMonthlyBase } from "./depreciation-straight-line";

describe("depreciation-straight-line", () => {
  it("base monthly is (cost - residual) / life months", () => {
    expect(straightLineMonthlyBase(1200, 0, 12)).toBe(100);
  });

  it("no depreciation in month of disposal", () => {
    const { amount, reason } = computeStraightLineForPeriod(
      {
        id: "1",
        cost: 1000,
        useful_life_months: 10,
        residual_value: 0,
        depreciation_method: "straight_line",
        start_depreciation_date: "2024-01-01",
        disposed_at: "2024-03-10",
        purchase_date: "2023-12-20",
      },
      "2024-03-01",
      200,
    );
    expect(amount).toBe(0);
    expect(reason).toBeDefined();
  });
});

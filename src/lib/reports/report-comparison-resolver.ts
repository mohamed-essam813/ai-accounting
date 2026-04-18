import { priorPeriodSameLength, priorYearSamePeriod } from "./period-windows";

export type PnlCompareMode = "none" | "prior_period" | "prior_year" | "custom";

export function resolvePnlCompareRanges(
  startDate: string,
  endDate: string,
  mode: PnlCompareMode,
  customStart: string | undefined,
  customEnd: string | undefined,
): { withComparison: boolean; compareStart: string; compareEnd: string } {
  if (mode === "none") {
    return { withComparison: false, compareStart: startDate, compareEnd: endDate };
  }
  if (mode === "custom" && customStart && customEnd) {
    return { withComparison: true, compareStart: customStart, compareEnd: customEnd };
  }
  if (mode === "prior_year") {
    const p = priorYearSamePeriod(startDate, endDate);
    return { withComparison: true, compareStart: p.startDate, compareEnd: p.endDate };
  }
  const p2 = priorPeriodSameLength(startDate, endDate);
  return { withComparison: true, compareStart: p2.startDate, compareEnd: p2.endDate };
}

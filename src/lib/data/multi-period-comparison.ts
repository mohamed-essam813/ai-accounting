/**
 * Multi-Period Comparison Data Access
 * 
 * Fetches financial data for multiple periods to enable N-period comparisons
 */

import { getPeriodFinancialData, type PeriodFinancialData } from "./period-comparison";
import type { DateRange } from "@/lib/utils/period-comparison";

/**
 * Format date to YYYY-MM-DD in local timezone (not UTC)
 * Prevents timezone shifts when converting dates
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface MultiPeriodData {
  periods: Array<{
    label: string;
    dateRange: DateRange;
    data: PeriodFinancialData;
  }>;
}

/**
 * Get financial data for multiple periods
 */
export async function getMultiPeriodData(
  dateRanges: Array<{ label: string; dateRange: DateRange }>,
  targetCurrency?: string,
): Promise<MultiPeriodData> {
  const periodsData = await Promise.all(
    dateRanges.map(async ({ label, dateRange }) => ({
      label,
      dateRange,
      data: await getPeriodFinancialData(dateRange, targetCurrency),
    })),
  );

  return {
    periods: periodsData,
  };
}

/**
 * Generate date ranges for last N months
 */
export function getLastNMonths(n: number): Array<{ label: string; dateRange: DateRange }> {
  const ranges: Array<{ label: string; dateRange: DateRange }> = [];
  const now = new Date();

  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    ranges.push({
      label: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      dateRange: {
        startDate: formatLocalDate(date),
        endDate: formatLocalDate(lastDay),
      },
    });
  }

  return ranges;
}

/**
 * Generate date ranges for last N quarters
 */
export function getLastNQuarters(n: number): Array<{ label: string; dateRange: DateRange }> {
  const ranges: Array<{ label: string; dateRange: DateRange }> = [];
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);

  for (let i = n - 1; i >= 0; i--) {
    const quarterOffset = currentQuarter - i;
    const year = now.getFullYear() - Math.floor(quarterOffset / 4);
    const quarter = ((quarterOffset % 4) + 4) % 4;
    
    const firstDay = new Date(year, quarter * 3, 1);
    const lastDay = new Date(year, (quarter + 1) * 3, 0);
    
    ranges.push({
      label: `Q${quarter + 1} ${year}`,
      dateRange: {
        startDate: formatLocalDate(firstDay),
        endDate: formatLocalDate(lastDay),
      },
    });
  }

  return ranges;
}

/**
 * Generate date ranges for last N years
 */
export function getLastNYears(n: number): Array<{ label: string; dateRange: DateRange }> {
  const ranges: Array<{ label: string; dateRange: DateRange }> = [];
  const now = new Date();

  for (let i = n - 1; i >= 0; i--) {
    const year = now.getFullYear() - i;
    const firstDay = new Date(year, 0, 1);
    const lastDay = new Date(year, 11, 31);
    
    ranges.push({
      label: year.toString(),
      dateRange: {
        startDate: formatLocalDate(firstDay),
        endDate: formatLocalDate(lastDay),
      },
    });
  }

  return ranges;
}

/**
 * Generate N prior periods from a custom date range
 * Uses the custom range length as the period length
 * Shifts the exact date range back by the period length * number of periods
 */
export function getMultiPeriodFromCustomRange(
  customRange: DateRange,
  n: number,
  unit: "MONTH" | "QUARTER" | "YEAR",
): Array<{ label: string; dateRange: DateRange }> {
  const ranges: Array<{ label: string; dateRange: DateRange }> = [];
  // Parse as local dates to avoid timezone shifts
  const [startYear, startMonth, startDay] = customRange.startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = customRange.endDate.split("-").map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  const periodLengthDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Generate N prior periods + the custom range itself
  // We'll generate from oldest to newest (n-1, n-2, ..., 0, custom)
  for (let i = n; i >= 0; i--) {
    const periodStart = new Date(start);
    const periodEnd = new Date(end);

    if (i === 0) {
      // This is the custom range itself
      ranges.push({
        label: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        dateRange: customRange,
      });
      continue;
    }

    // Shift back by i periods using the unit
    switch (unit) {
      case "MONTH":
        periodStart.setMonth(periodStart.getMonth() - i);
        periodEnd.setMonth(periodEnd.getMonth() - i);
        break;
      case "QUARTER":
        periodStart.setMonth(periodStart.getMonth() - i * 3);
        periodEnd.setMonth(periodEnd.getMonth() - i * 3);
        break;
      case "YEAR":
        periodStart.setFullYear(periodStart.getFullYear() - i);
        periodEnd.setFullYear(periodEnd.getFullYear() - i);
        break;
    }

    // Format label based on unit
    let label: string;
    if (unit === "MONTH") {
      label = periodStart.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    } else if (unit === "QUARTER") {
      const quarter = Math.floor(periodStart.getMonth() / 3) + 1;
      label = `Q${quarter} ${periodStart.getFullYear()}`;
    } else {
      label = periodStart.getFullYear().toString();
    }

    ranges.push({
      label,
      dateRange: {
        startDate: formatLocalDate(periodStart),
        endDate: formatLocalDate(periodEnd),
      },
    });
  }

  return ranges;
}

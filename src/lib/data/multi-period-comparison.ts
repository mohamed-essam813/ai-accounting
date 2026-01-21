/**
 * Multi-Period Comparison Data Access
 * 
 * Fetches financial data for multiple periods to enable N-period comparisons
 */

import { getPeriodFinancialData, type PeriodFinancialData } from "./period-comparison";
import type { DateRange } from "@/lib/utils/period-comparison";

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
        startDate: date.toISOString().split("T")[0],
        endDate: lastDay.toISOString().split("T")[0],
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
        startDate: firstDay.toISOString().split("T")[0],
        endDate: lastDay.toISOString().split("T")[0],
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
        startDate: firstDay.toISOString().split("T")[0],
        endDate: lastDay.toISOString().split("T")[0],
      },
    });
  }

  return ranges;
}

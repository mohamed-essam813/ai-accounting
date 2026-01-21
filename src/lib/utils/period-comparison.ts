/**
 * Period Comparison Utilities
 * Excel Elimination Doctrine: Native Comparisons (No Manual Spreadsheets)
 * 
 * Supports:
 * - Current vs previous period
 * - Current vs same period last year
 * - Month vs month
 * - Custom range vs baseline
 */

export interface PeriodComparison {
  current: number;
  previous: number;
  difference: number;
  absoluteChange?: number; // Added for metrics engine
  percentageChange: number;
  direction: "up" | "down" | "stable";
}

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

/**
 * Get previous period date range (same length as current period)
 */
export function getPreviousPeriodRange(
  startDate: string,
  endDate: string,
): DateRange {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - daysDiff);

  return {
    startDate: prevStart.toISOString().split("T")[0],
    endDate: prevEnd.toISOString().split("T")[0],
  };
}

/**
 * Get same period last year
 */
export function getSamePeriodLastYear(
  startDate: string,
  endDate: string,
): DateRange {
  const start = new Date(startDate);
  const end = new Date(endDate);

  start.setFullYear(start.getFullYear() - 1);
  end.setFullYear(end.getFullYear() - 1);

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

/**
 * Get previous month
 */
export function getPreviousMonth(): DateRange {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  return {
    startDate: prevMonth.toISOString().split("T")[0],
    endDate: prevMonthEnd.toISOString().split("T")[0],
  };
}

/**
 * Get current month
 */
export function getCurrentMonth(): DateRange {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    startDate: firstDay.toISOString().split("T")[0],
    endDate: lastDay.toISOString().split("T")[0],
  };
}

/**
 * Get current quarter
 */
export function getCurrentQuarter(): DateRange {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  const firstDay = new Date(now.getFullYear(), quarter * 3, 1);
  const lastDay = new Date(now.getFullYear(), (quarter + 1) * 3, 0);

  return {
    startDate: firstDay.toISOString().split("T")[0],
    endDate: lastDay.toISOString().split("T")[0],
  };
}

/**
 * Get previous quarter
 */
export function getPreviousQuarter(): DateRange {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  const prevQuarter = quarter === 0 ? 3 : quarter - 1;
  const prevYear = quarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const firstDay = new Date(prevYear, prevQuarter * 3, 1);
  const lastDay = new Date(prevYear, (prevQuarter + 1) * 3, 0);

  return {
    startDate: firstDay.toISOString().split("T")[0],
    endDate: lastDay.toISOString().split("T")[0],
  };
}

/**
 * Get current year
 */
export function getCurrentYear(): DateRange {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), 0, 1);
  const lastDay = new Date(now.getFullYear(), 11, 31);

  return {
    startDate: firstDay.toISOString().split("T")[0],
    endDate: lastDay.toISOString().split("T")[0],
  };
}

/**
 * Get previous year
 */
export function getPreviousYear(): DateRange {
  const now = new Date();
  const firstDay = new Date(now.getFullYear() - 1, 0, 1);
  const lastDay = new Date(now.getFullYear() - 1, 11, 31);

  return {
    startDate: firstDay.toISOString().split("T")[0],
    endDate: lastDay.toISOString().split("T")[0],
  };
}

/**
 * Calculate period comparison metrics
 */
export function calculateComparison(
  current: number,
  previous: number,
): PeriodComparison {
  const difference = current - previous;
  const percentageChange =
    previous !== 0 ? (difference / Math.abs(previous)) * 100 : 0;

  // Determine direction (stable if change is less than 1% or $1)
  let direction: "up" | "down" | "stable";
  if (Math.abs(percentageChange) < 1 || Math.abs(difference) < 1) {
    direction = "stable";
  } else if (difference > 0) {
    direction = "up";
  } else {
    direction = "down";
  }

  return {
    current,
    previous,
    difference,
    absoluteChange: Math.abs(difference),
    percentageChange,
    direction,
  };
}

/**
 * Format comparison for display
 */
export function formatComparison(comparison: PeriodComparison): {
  text: string;
  shortText: string;
} {
  const { current, previous, difference, percentageChange, direction } = comparison;

  const absPercentage = Math.abs(percentageChange);
  const absDifference = Math.abs(difference);

  let text = "";
  let shortText = "";

  if (direction === "stable") {
    text = `No significant change from previous period (${formatCurrency(current)} vs ${formatCurrency(previous)})`;
    shortText = "Stable";
  } else {
    const directionText = direction === "up" ? "higher" : "lower";
    text = `${formatCurrency(current)} is ${absPercentage.toFixed(1)}% ${directionText} than previous period (${formatCurrency(previous)}). Difference: ${formatCurrency(absDifference)}`;
    shortText = `${direction === "up" ? "+" : "-"}${absPercentage.toFixed(1)}%`;
  }

  return { text, shortText };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}


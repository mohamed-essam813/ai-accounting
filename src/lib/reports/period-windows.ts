import { addYears, differenceInCalendarDays, format, isAfter, parseISO, startOfDay, subDays, endOfMonth } from "date-fns";
import { startOfFiscalYear } from "./fiscal-year";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Inclusive day count between start and end (date-only).
 */
export function rangeDayCount(startDate: string, endDate: string): number {
  return differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
}

/** Prior period of the same (inclusive) day length ending the day before `startDate`. */
export function priorPeriodSameLength(startDate: string, endDate: string): { startDate: string; endDate: string } {
  const s = startOfDay(parseISO(startDate));
  const n = rangeDayCount(startDate, endDate);
  const priorEnd = subDays(s, 1);
  const priorStart = subDays(priorEnd, n - 1);
  return { startDate: iso(priorStart), endDate: iso(priorEnd) };
}

export function priorYearSamePeriod(startDate: string, endDate: string): { startDate: string; endDate: string } {
  const a = addYears(parseISO(startDate), -1);
  const b = addYears(parseISO(endDate), -1);
  return { startDate: iso(a), endDate: iso(b) };
}

/** "As of" = snapshot end date for balance sheet; prior default = end of month before. */
export function asOfToPriorMonthEndEnd(asOfDate: string): string {
  const d = endOfMonth(subDays(startOfDay(parseISO(asOfDate)), 1));
  return iso(d);
}

/**
 * "Today" for validation — not future. Uses date-only in tenant TZ assumption (UTC).
 */
export function isFutureDateOnly(d: string): boolean {
  return isAfter(startOfDay(parseISO(d)), startOfDay(new Date()));
}

/**
 * Preset resolution (partial — extended in period-presets for fiscal).
 */
export function thisFiscalYearToDate(fiscalStartMonth1to12: number, ref: Date = new Date()): { startDate: string; endDate: string } {
  const s = startOfFiscalYear(ref, fiscalStartMonth1to12);
  return { startDate: iso(s), endDate: iso(startOfDay(ref)) };
}

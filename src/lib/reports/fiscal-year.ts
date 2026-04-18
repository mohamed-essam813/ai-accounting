import { getMonth, getYear, parseISO, setMonth, setYear, startOfMonth } from "date-fns";
import { format } from "date-fns";

export const parse = parseISO;

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * @param fiscalStartMonth 1–12 (e.g. 1 = Jan)
 */
export function startOfFiscalYear(ref: Date, fiscalStartMonth1to12: number): Date {
  const m = getMonth(ref); // 0–11
  const fy0 = (fiscalStartMonth1to12 - 1 + 12) % 12; // 0–11
  const y = getYear(ref);
  const inFy = m >= fy0;
  const yearStartY = inFy ? y : y - 1;
  const d = setMonth(setYear(startOfMonth(new Date(0)), yearStartY), fiscalStartMonth1to12 - 1);
  return d;
}

export function endOfFiscalYear(ref: Date, fiscalStartMonth1to12: number): Date {
  const s = startOfFiscalYear(ref, fiscalStartMonth1to12);
  // last day of month before next FY start
  return new Date(s.getFullYear() + 1, getMonth(s), 0, 12, 0, 0, 0);
}

export function isDateInFiscalSoFar(ref: Date, fiscalStartMonth1to12: number): { start: string; end: string } {
  const s = startOfFiscalYear(ref, fiscalStartMonth1to12);
  return { start: iso(s), end: iso(ref) };
}

import type { ReportApiSlug } from "./report-api-types";

export type ReportTabId = "pnl" | "balance" | "cashflow" | "vat" | "trial" | "ar" | "ap";

/** Map unified `/reports?report=…` slugs to legacy tab ids (period vs snapshot). */
export function reportSlugToTabId(slug: string): ReportTabId {
  const m: Record<ReportApiSlug, ReportTabId> = {
    pnl: "pnl",
    balance_sheet: "balance",
    cash_flow: "cashflow",
    vat: "vat",
    trial_balance: "trial",
    ar_aging: "ar",
    ap_aging: "ap",
  };
  return m[slug as ReportApiSlug] ?? "pnl";
}

export function reportTabIdToSlug(tab: ReportTabId): ReportApiSlug {
  const m: Record<ReportTabId, ReportApiSlug> = {
    pnl: "pnl",
    balance: "balance_sheet",
    cashflow: "cash_flow",
    vat: "vat",
    trial: "trial_balance",
    ar: "ar_aging",
    ap: "ap_aging",
  };
  return m[tab];
}

const PERIOD_TABS: ReportTabId[] = ["pnl", "cashflow", "vat"];
const SNAPSHOT_TABS: ReportTabId[] = ["balance", "trial", "ar", "ap"];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return iso(new Date());
}

/** Month-to-date: first day of current month through today. */
export function monthToDateRange(): { startDate: string; endDate: string } {
  const t = new Date();
  const start = new Date(t.getFullYear(), t.getMonth(), 1);
  return { startDate: iso(start), endDate: iso(t) };
}

/** As-of snapshot: single date (start = end = today). */
export function asOfTodayRange(): { startDate: string; endDate: string } {
  const d = todayIso();
  return { startDate: d, endDate: d };
}

export function defaultDateRangeForTab(tab: ReportTabId): { startDate: string; endDate: string } {
  if (PERIOD_TABS.includes(tab)) return monthToDateRange();
  if (SNAPSHOT_TABS.includes(tab)) return asOfTodayRange();
  return monthToDateRange();
}

export function resolveReportDates(
  tab: ReportTabId,
  startDate?: string,
  endDate?: string,
): { startDate: string; endDate: string } {
  if (startDate && endDate) return { startDate, endDate };
  return defaultDateRangeForTab(tab);
}

export function thisMonthPreset(): { startDate: string; endDate: string } {
  return monthToDateRange();
}

export function thisQuarterPreset(): { startDate: string; endDate: string } {
  const t = new Date();
  const q = Math.floor(t.getMonth() / 3);
  const start = new Date(t.getFullYear(), q * 3, 1);
  return { startDate: iso(start), endDate: iso(t) };
}

export function thisYearPreset(): { startDate: string; endDate: string } {
  const t = new Date();
  const start = new Date(t.getFullYear(), 0, 1);
  return { startDate: iso(start), endDate: iso(t) };
}

/** Calendar last month (full month). */
export function lastMonthPreset(): { startDate: string; endDate: string } {
  const t = new Date();
  const start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const end = new Date(t.getFullYear(), t.getMonth(), 0);
  return { startDate: iso(start), endDate: iso(end) };
}

/** Previous calendar quarter through today is ambiguous; use full previous quarter. */
export function lastQuarterPreset(): { startDate: string; endDate: string } {
  const t = new Date();
  const q = Math.floor(t.getMonth() / 3);
  const prevQ = q === 0 ? 3 : q - 1;
  const year = q === 0 ? t.getFullYear() - 1 : t.getFullYear();
  const startMonth = prevQ * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  return { startDate: iso(start), endDate: iso(end) };
}

/** Year-to-date: Jan 1 through today (same as "This Year" end = today per spec). */
export function yearToDatePreset(): { startDate: string; endDate: string } {
  return thisYearPreset();
}

export const REPORT_DATE_STORAGE_KEY = "ai-accounting.reports.dateRanges.v1";

export type StoredReportDateRanges = Partial<
  Record<ReportTabId, { startDate: string; endDate: string }>
>;

export function rangesMatch(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate === b.startDate && a.endDate === b.endDate;
}

/** True if range matches month-to-date (this month through today). */
export function isThisMonthHighlighted(
  startDate: string,
  endDate: string,
): boolean {
  const m = monthToDateRange();
  return rangesMatch({ startDate, endDate }, m);
}

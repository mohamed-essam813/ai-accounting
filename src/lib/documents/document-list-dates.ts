import {
  lastMonthPreset,
  lastQuarterPreset,
  thisMonthPreset,
  thisQuarterPreset,
  thisYearPreset,
  todayIso,
} from "@/lib/reports/report-date-defaults";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Single calendar day (user local timezone). */
export function todayPreset(): { startDate: string; endDate: string } {
  const d = todayIso();
  return { startDate: d, endDate: d };
}

/** Monday–today (ISO week-ish, week starts Monday). */
export function thisWeekPreset(): { startDate: string; endDate: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return { startDate: iso(monday), endDate: iso(now) };
}

export type DocumentListKind = "invoices" | "bills" | "payments";

export const DOCUMENT_LIST_DATE_STORAGE_KEY: Record<DocumentListKind, string> = {
  invoices: "ai-accounting.documentList.dateRange.invoices.v1",
  bills: "ai-accounting.documentList.dateRange.bills.v1",
  payments: "ai-accounting.documentList.dateRange.payments.v1",
};

export type DatePresetId =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "custom";

export function rangeForPreset(id: DatePresetId): { startDate: string; endDate: string } {
  switch (id) {
    case "today":
      return todayPreset();
    case "this_week":
      return thisWeekPreset();
    case "this_month":
      return thisMonthPreset();
    case "last_month":
      return lastMonthPreset();
    case "this_quarter":
      return thisQuarterPreset();
    case "last_quarter":
      return lastQuarterPreset();
    case "this_year":
      return thisYearPreset();
    case "custom":
    default:
      return thisMonthPreset();
  }
}

export function loadStoredDateRange(
  kind: DocumentListKind,
): { startDate: string; endDate: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DOCUMENT_LIST_DATE_STORAGE_KEY[kind]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { startDate?: string; endDate?: string };
    if (parsed.startDate && parsed.endDate) return { startDate: parsed.startDate, endDate: parsed.endDate };
  } catch {
    /* ignore */
  }
  return null;
}

export function saveStoredDateRange(
  kind: DocumentListKind,
  range: { startDate: string; endDate: string },
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DOCUMENT_LIST_DATE_STORAGE_KEY[kind], JSON.stringify(range));
  } catch {
    /* ignore */
  }
}

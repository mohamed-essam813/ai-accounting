export const REPORT_API_SLUGS = [
  "pnl",
  "balance_sheet",
  "cash_flow",
  "trial_balance",
  "vat",
  "ar_aging",
  "ap_aging",
] as const;
export type ReportApiSlug = (typeof REPORT_API_SLUGS)[number];

export const REPORT_API_SLUG_SET: ReadonlySet<string> = new Set(REPORT_API_SLUGS);

export function isReportApiSlug(s: string): s is ReportApiSlug {
  return REPORT_API_SLUG_SET.has(s);
}

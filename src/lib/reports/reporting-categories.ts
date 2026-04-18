import type { PlLineSection } from "@/lib/accounting/account-classification";

const PL_CATS = [
  "Revenue",
  "Cost of Sales",
  "Operating Expenses",
  "Other Income",
  "Other Expenses",
] as const;

const BS = [
  "Current Assets",
  "Non-current Assets",
  "Current Liabilities",
  "Non-current Liabilities",
  "Equity",
] as const;

export const REPORTING_CATEGORIES = [...PL_CATS, ...BS] as const;
export type ReportingCategoryType = (typeof REPORTING_CATEGORIES)[number];
export type ReportingPlCategory = (typeof PL_CATS)[number];

export function isReportingPlCategory(s: string | null | undefined): s is ReportingPlCategory {
  return s != null && (PL_CATS as readonly string[]).includes(s);
}

export function reportingCategoryToPlSection(
  c: ReportingPlCategory,
): PlLineSection {
  const map: Record<ReportingPlCategory, PlLineSection> = {
    Revenue: "revenue",
    "Cost of Sales": "cost_of_sales",
    "Operating Expenses": "operating_expenses",
    "Other Income": "other_income",
    "Other Expenses": "gain_loss",
  };
  return map[c];
}

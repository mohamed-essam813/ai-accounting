/**
 * Unified reporting classification (balance sheet + P&L + tax).
 * Stored on chart_of_accounts.reporting_classification — reporting must use this, not name heuristics.
 */

import type { PlLineSection } from "@/lib/accounting/account-classification";

export const REPORTING_CLASSIFICATION_VALUES = [
  "asset_current",
  "asset_non_current",
  "liability_current",
  "liability_non_current",
  "equity",
  "revenue",
  "cost_of_sales",
  "operating_expense",
  "other_income",
  "other_expense",
  "tax_input",
  "tax_output",
] as const;

export type ReportingClassification = (typeof REPORTING_CLASSIFICATION_VALUES)[number];

export function isReportingClassification(s: string | null | undefined): s is ReportingClassification {
  return s != null && (REPORTING_CLASSIFICATION_VALUES as readonly string[]).includes(s);
}

/** Maps unified classification to P&L line section; null when not a P&L row. */
export function reportingClassificationToPlSection(
  rc: ReportingClassification | null | undefined,
): PlLineSection | null {
  if (!rc) return null;
  const map: Partial<Record<ReportingClassification, PlLineSection>> = {
    revenue: "revenue",
    cost_of_sales: "cost_of_sales",
    operating_expense: "operating_expenses",
    other_income: "other_income",
    other_expense: "gain_loss",
  };
  return map[rc] ?? null;
}

export function mapTypeAndCategoryToReportingClassification(params: {
  type: string;
  category?: "current" | "non_current" | null;
}): ReportingClassification | null {
  const { type, category } = params;
  if (type === "equity") return "equity";
  if (type === "asset") {
    return category === "non_current" ? "asset_non_current" : "asset_current";
  }
  if (type === "liability") {
    return category === "non_current" ? "liability_non_current" : "liability_current";
  }
  if (type === "revenue") return "revenue";
  if (type === "expense") return "operating_expense";
  return null;
}

/**
 * Synonym / keyword layer: map user language to canonical standard account names.
 * DB table account_mapping_keywords extends this; global defaults are in-memory for speed.
 */

import { normalizeEntityName } from "@/lib/utils/entity-dedupe";
import type { ReportingClassification } from "@/lib/accounting/reporting-classification";

export type KeywordResolution = {
  targetStandardName: string;
  targetReportingClassification: ReportingClassification;
  confidenceScore: number;
  source: "global_table" | "global_static";
};

/** Static defaults (same intent as seeded rows in account_mapping_keywords). */
const STATIC_KEYWORD_MAP: Array<{
  keys: string[];
  targetStandardName: string;
  targetReportingClassification: ReportingClassification;
  confidenceScore: number;
}> = [
  { keys: ["freight", "shipping", "courier"], targetStandardName: "Delivery & Logistics", targetReportingClassification: "operating_expense", confidenceScore: 0.95 },
  { keys: ["salary", "payroll", "wages"], targetStandardName: "Salaries & Wages", targetReportingClassification: "operating_expense", confidenceScore: 1 },
  { keys: ["rent", "office rent"], targetStandardName: "Rent Expense", targetReportingClassification: "operating_expense", confidenceScore: 0.95 },
  { keys: ["facebook ads", "google ads", "marketing"], targetStandardName: "Marketing & Advertising", targetReportingClassification: "operating_expense", confidenceScore: 0.9 },
  { keys: ["software", "subscription", "saas"], targetStandardName: "Software Subscriptions", targetReportingClassification: "operating_expense", confidenceScore: 0.9 },
  { keys: ["electricity", "water", "utilities", "gas"], targetStandardName: "Utilities Expense", targetReportingClassification: "operating_expense", confidenceScore: 0.9 },
  { keys: ["consulting", "legal", "audit"], targetStandardName: "Professional Fees", targetReportingClassification: "operating_expense", confidenceScore: 0.9 },
  { keys: ["insurance"], targetStandardName: "Insurance Expense", targetReportingClassification: "operating_expense", confidenceScore: 0.95 },
  { keys: ["cogs", "cost of goods"], targetStandardName: "Cost of Goods Sold", targetReportingClassification: "cost_of_sales", confidenceScore: 1 },
];

export function normalizeAccountSearchText(text: string): string {
  return normalizeEntityName(text);
}

export function resolveKeywordFromStaticMap(raw: string): KeywordResolution | null {
  const q = normalizeAccountSearchText(raw);
  if (!q) return null;
  for (const row of STATIC_KEYWORD_MAP) {
    for (const k of row.keys) {
      if (q === k || q.includes(k) || k.includes(q)) {
        return {
          targetStandardName: row.targetStandardName,
          targetReportingClassification: row.targetReportingClassification,
          confidenceScore: row.confidenceScore,
          source: "global_static",
        };
      }
    }
  }
  return null;
}

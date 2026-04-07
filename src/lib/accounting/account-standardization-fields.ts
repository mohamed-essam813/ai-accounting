import { normalizeAccountUniquenessKey } from "@/lib/utils/entity-dedupe";
import type { AccountClassification } from "@/lib/accounting/account-classification";
import {
  mapTypeAndCategoryToReportingClassification,
  type ReportingClassification,
  isReportingClassification,
} from "@/lib/accounting/reporting-classification";

export function buildStandardizationFieldsForNewAccount(params: {
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  category?: "current" | "non_current" | null;
  /** From defaultAccountClassificationForCreate or explicit user/AI choice */
  accountClassification: AccountClassification | null;
}): {
  normalized_name: string;
  standardized_name: string;
  reporting_classification: ReportingClassification | null;
  account_classification: AccountClassification | null;
  is_custom: boolean;
  is_system_standard: boolean;
} {
  const standardized_name = params.name.trim();
  const normalized_name = normalizeAccountUniquenessKey(standardized_name);
  const account_classification = params.accountClassification;

  let reporting_classification: ReportingClassification | null = null;

  if (params.type === "revenue" || params.type === "expense") {
    if (account_classification && isReportingClassification(account_classification)) {
      reporting_classification = account_classification;
    }
  } else {
    reporting_classification = mapTypeAndCategoryToReportingClassification({
      type: params.type,
      category: params.category ?? null,
    });
  }

  return {
    normalized_name,
    standardized_name,
    reporting_classification,
    account_classification,
    is_custom: true,
    is_system_standard: false,
  };
}

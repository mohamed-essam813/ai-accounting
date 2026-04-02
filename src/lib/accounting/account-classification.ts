/** P&L line grouping (matches PLLineItem.section). */
export type PlLineSection =
  | "revenue"
  | "cost_of_sales"
  | "operating_expenses"
  | "other_income"
  | "gain_loss";

/** Stored on chart_of_accounts; drives P&L sections. */
export const ACCOUNT_CLASSIFICATION_VALUES = [
  "revenue",
  "cost_of_sales",
  "operating_expense",
  "other_income",
  "other_expense",
] as const;

export type AccountClassification = (typeof ACCOUNT_CLASSIFICATION_VALUES)[number];

/** Options valid for revenue vs expense rows in Chart of Accounts. */
export function pnlClassificationOptionsForType(type: string): AccountClassification[] {
  if (type === "revenue") return ["revenue", "other_income"];
  if (type === "expense") return ["cost_of_sales", "operating_expense", "other_expense"];
  return [];
}

export const PNL_CLASSIFICATION_LABEL: Record<AccountClassification, string> = {
  revenue: "Revenue",
  cost_of_sales: "Cost of sales",
  operating_expense: "Operating expenses",
  other_income: "Other income",
  other_expense: "Other expense / non-operating",
};

export function isAccountClassification(s: string | null | undefined): s is AccountClassification {
  return (
    s !== null &&
    s !== undefined &&
    (ACCOUNT_CLASSIFICATION_VALUES as readonly string[]).includes(s)
  );
}

/** Map DB value to P&L line section. */
export function classificationToPlSection(classification: AccountClassification): PlLineSection {
  const map: Record<AccountClassification, PlLineSection> = {
    revenue: "revenue",
    cost_of_sales: "cost_of_sales",
    operating_expense: "operating_expenses",
    other_income: "other_income",
    other_expense: "gain_loss",
  };
  return map[classification];
}

/**
 * Default classification when creating an account (explicit user/AI value wins).
 * Does not use account name.
 */
export function defaultAccountClassificationForCreate(params: {
  type: string;
  prd_account_kind?: string | null;
  explicit?: AccountClassification | null;
}): AccountClassification | null {
  if (params.explicit && isAccountClassification(params.explicit)) {
    return params.explicit;
  }
  if (params.type === "revenue") {
    return "revenue";
  }
  if (params.type === "expense") {
    return "operating_expense";
  }
  return null;
}

/**
 * Legacy fallback when account_classification is null (pre-migration or external data).
 * Prefer DB column everywhere else. Does not use broad code ranges for COGS (that misclassified OpEx).
 */
export function legacyInferPlSection(params: {
  code: string;
  type: string | null;
  name: string | null;
}): PlLineSection | null {
  const code = parseInt(params.code || "0", 10);
  const type = params.type ?? "";
  const name = (params.name ?? "").toLowerCase();

  if (type === "revenue") {
    if (code === 4200) return "other_income";
    if (code >= 4000 && code < 5000) return "revenue";
    return null;
  }
  if (type === "expense") {
    if (name.includes("cost of goods sold") || code === 5500) return "cost_of_sales";
    if (code >= 5000 && code < 6000) return "operating_expenses";
    return null;
  }
  return null;
}

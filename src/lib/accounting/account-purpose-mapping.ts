/**
 * Maps founder-friendly "account purpose" to chart_of_accounts fields (type, category, detail_type, prd_account_kind).
 */

import type { AccountClassification } from "@/lib/accounting/account-classification";

/** IDs for the "What is this account used for?" control */
export type AccountPurposeId =
  | "bank"
  | "cash"
  | "accounts_receivable"
  | "accounts_payable"
  | "inventory"
  | "equipment"
  | "income"
  | "expense"
  | "tax"
  | "other";

export type MappedAccountClassification = {
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  category: "current" | "non_current" | null;
  detail_type: "bank" | "cash" | "other_current_asset" | "fixed_asset" | "other" | null;
  prd_account_kind:
    | "bank"
    | "cash"
    | "accounts_receivable"
    | "accounts_payable"
    | "inventory"
    | "fixed_asset"
    | "revenue"
    | "expense"
    | "equity"
    | "tax"
    | "other"
    | null;
};

/** When purpose is `equipment`, whether the asset is used beyond one year (non-current vs current). */
export function mapAccountPurpose(
  purpose: AccountPurposeId,
  equipmentOverOneYear?: boolean,
): MappedAccountClassification {
  switch (purpose) {
    case "bank":
      return {
        type: "asset",
        category: "current",
        detail_type: "bank",
        prd_account_kind: "bank",
      };
    case "cash":
      return {
        type: "asset",
        category: "current",
        detail_type: "cash",
        prd_account_kind: "cash",
      };
    case "accounts_receivable":
      return {
        type: "asset",
        category: "current",
        detail_type: "other_current_asset",
        prd_account_kind: "accounts_receivable",
      };
    case "accounts_payable":
      return {
        type: "liability",
        category: "current",
        detail_type: null,
        prd_account_kind: "accounts_payable",
      };
    case "inventory":
      return {
        type: "asset",
        category: "current",
        detail_type: "other_current_asset",
        prd_account_kind: "inventory",
      };
    case "equipment": {
      const longTerm = equipmentOverOneYear === true;
      return {
        type: "asset",
        category: longTerm ? "non_current" : "current",
        detail_type: "fixed_asset",
        prd_account_kind: "fixed_asset",
      };
    }
    case "income":
      return {
        type: "revenue",
        category: null,
        detail_type: null,
        prd_account_kind: "revenue",
      };
    case "expense":
      return {
        type: "expense",
        category: null,
        detail_type: null,
        prd_account_kind: "expense",
      };
    case "tax":
      return {
        type: "liability",
        category: "current",
        detail_type: null,
        prd_account_kind: "tax",
      };
    case "other":
    default:
      return {
        type: "asset",
        category: "current",
        detail_type: "other",
        prd_account_kind: "other",
      };
  }
}

export const ACCOUNT_PURPOSE_OPTIONS: ReadonlyArray<{
  id: AccountPurposeId;
  label: string;
  description?: string;
  icon: string;
}> = [
  { id: "bank", label: "Bank account", icon: "🏦" },
  { id: "cash", label: "Cash", icon: "💵" },
  {
    id: "accounts_receivable",
    label: "Customers owe me",
    description: "Accounts receivable",
    icon: "🧾",
  },
  {
    id: "accounts_payable",
    label: "I owe suppliers",
    description: "Accounts payable",
    icon: "📄",
  },
  { id: "inventory", label: "Inventory (products to sell)", icon: "📦" },
  { id: "equipment", label: "Equipment / asset (used over time)", icon: "🖥️" },
  { id: "income", label: "Income", icon: "📈" },
  { id: "expense", label: "Expense", icon: "📉" },
  { id: "tax", label: "Tax", icon: "🏛️" },
  { id: "other", label: "Other", icon: "📌" },
] as const;

/** P&L classification for simple account creation (not name-based). */
export function purposeToAccountClassification(purpose: AccountPurposeId): AccountClassification | null {
  switch (purpose) {
    case "income":
      return "revenue";
    case "expense":
      return "operating_expense";
    default:
      return null;
  }
}

/** Build payload compatible with createAccountAction (AccountSchema) */
export function purposeToCreateAccountPayload(params: {
  purpose: AccountPurposeId;
  equipmentOverOneYear?: boolean;
}): {
  type: MappedAccountClassification["type"];
  category: MappedAccountClassification["category"];
  detail_type: MappedAccountClassification["detail_type"];
  prd_account_kind: NonNullable<MappedAccountClassification["prd_account_kind"]> | undefined;
} {
  const m = mapAccountPurpose(params.purpose, params.equipmentOverOneYear);
  return {
    type: m.type,
    category: m.category,
    detail_type: m.detail_type,
    prd_account_kind: m.prd_account_kind ?? undefined,
  };
}

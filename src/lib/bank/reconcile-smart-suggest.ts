/**
 * Founder-friendly copy + keyword hints for bank reconciliation (no accounting jargon in UI).
 * Expense / revenue account resolution uses default COA names from ensureDefaultAccounts.
 */

export type ReconcileMoneyDirection = "in" | "out";

export type SmartPrimaryKind =
  | "expense"
  | "supplier_payment"
  | "transfer"
  | "other"
  | "income"
  | "customer_receipt"
  | "transfer_in";

export type SmartSuggestion = {
  /** Shown after a "Suggested:" prefix in the UI, e.g. "Expense (Bank charges)" */
  inlineLabel: string;
  primaryKind: SmartPrimaryKind;
  /** Preferred expense/revenue account name (matched against chart of accounts) */
  preferredAccountName: string;
  /** Short reason for debugging / support (not shown to end users by default) */
  matchReason: string;
};

type AccountLite = { id: string; name: string; code: string; type: string; is_active?: boolean };

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * Heuristic: what to suggest before the user opens the Resolve flow.
 */
export function getSmartSuggestion(description: string, amount: number): SmartSuggestion {
  const d = description.toLowerCase();
  const outgoing = amount < 0;

  if (includesAny(d, ["payroll", "salary", "salaries", "wage"])) {
    return outgoing
      ? {
          inlineLabel: "Expense (Salaries)",
          primaryKind: "expense",
          preferredAccountName: "Salaries & Wages",
          matchReason: "payroll_keywords",
        }
      : {
          inlineLabel: "Income (Other)",
          primaryKind: "income",
          preferredAccountName: "Other Income",
          matchReason: "payroll_in",
        };
  }

  if (includesAny(d, ["charge", "charges", "fee", "fees", "ips"])) {
    return outgoing
      ? {
          inlineLabel: "Expense (Bank charges)",
          primaryKind: "expense",
          preferredAccountName: "General Expense",
          matchReason: "bank_charges_keywords",
        }
      : {
          inlineLabel: "Income (Other)",
          primaryKind: "income",
          preferredAccountName: "Other Income",
          matchReason: "fee_refund",
        };
  }

  if (includesAny(d, ["transfer", "xfer", "trf"])) {
    return outgoing
      ? {
          inlineLabel: "Transfer",
          primaryKind: "transfer",
          preferredAccountName: "General Expense",
          matchReason: "transfer_keyword_out",
        }
      : {
          inlineLabel: "Transfer",
          primaryKind: "transfer_in",
          preferredAccountName: "Other Income",
          matchReason: "transfer_keyword_in",
        };
  }

  if (includesAny(d, ["rent", "lease"])) {
    return {
      inlineLabel: "Expense (Rent)",
      primaryKind: "expense",
      preferredAccountName: "Rent Expense",
      matchReason: "rent",
    };
  }

  if (includesAny(d, ["utility", "utilities", "electric", "water"])) {
    return {
      inlineLabel: "Expense (Utilities)",
      primaryKind: "expense",
      preferredAccountName: "Utilities Expense",
      matchReason: "utilities",
    };
  }

  if (includesAny(d, ["marketing", "ads", "advertising"])) {
    return {
      inlineLabel: "Expense (Marketing)",
      primaryKind: "expense",
      preferredAccountName: "Marketing Expense",
      matchReason: "marketing",
    };
  }

  if (includesAny(d, ["supplier", "vendor", "invoice", "bill"])) {
    return outgoing
      ? {
          inlineLabel: "Supplier payment",
          primaryKind: "supplier_payment",
          preferredAccountName: "General Expense",
          matchReason: "supplier_keywords",
        }
      : {
          inlineLabel: "Customer payment",
          primaryKind: "customer_receipt",
          preferredAccountName: "Service Revenue",
          matchReason: "customer_keywords",
        };
  }

  // Default
  if (outgoing) {
    return {
      inlineLabel: "Expense (General)",
      primaryKind: "expense",
      preferredAccountName: "General Expense",
      matchReason: "default_out",
    };
  }
  return {
    inlineLabel: "Income (Services)",
    primaryKind: "income",
    preferredAccountName: "Service Revenue",
    matchReason: "default_in",
  };
}

/**
 * Pick best-matching expense or revenue account from chart of accounts by preferred name.
 */
export function matchAccountByPreferredName(
  accounts: AccountLite[],
  preferredName: string,
  type: "expense" | "revenue",
): AccountLite | null {
  const pool = accounts.filter((a) => a.type === type && a.is_active !== false);
  const exact = pool.find((a) => a.name.trim().toLowerCase() === preferredName.toLowerCase());
  if (exact) return exact;
  const partial = pool.find((a) =>
    a.name.toLowerCase().includes(preferredName.toLowerCase().slice(0, 6)),
  );
  if (partial) return partial;
  const contains = pool.find((a) =>
    preferredName.toLowerCase().split(/\s+/).some((w) => w.length > 3 && a.name.toLowerCase().includes(w)),
  );
  return contains ?? pool[0] ?? null;
}

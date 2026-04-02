import type { Account } from "@/lib/accounting";
import type { DraftPayload } from "@/lib/ai/schema";
import { getTaxRateById } from "@/lib/data/tax-rates";

type AccountSuggestion = NonNullable<DraftPayload["accounts"]>["debit_account"];

export function suggestionForAccount(acc: Account): AccountSuggestion {
  const st = acc.type as AccountSuggestion["suggested_type"];
  return {
    suggested_name: acc.name,
    suggested_type: st,
    suggested_category: st === "asset" || st === "liability" ? "current" : null,
    existing_account_id: acc.id,
    confidence: 1,
  };
}

/**
 * Debit is expense, inventory, or fixed-asset account depending on purchase type.
 */
export async function buildBillAccounts(
  accounts: Account[],
  debitAccountId: string | null,
  taxRateId: string | null,
): Promise<NonNullable<DraftPayload["accounts"]>> {
  const ap = accounts.find((a) => a.code === "2000");
  const debit = debitAccountId
    ? accounts.find((a) => a.id === debitAccountId)
    : accounts.find((a) => a.code === "5000");
  if (!ap) {
    throw new Error("Accounts payable (code 2000) is missing.");
  }
  if (!debit) {
    throw new Error(
      "Debit account is missing. Choose an expense or fixed asset account, or add default code 5000.",
    );
  }
  let taxDebit: AccountSuggestion | undefined;
  if (taxRateId) {
    const tr = await getTaxRateById(taxRateId);
    if (tr?.input_vat_account_id) {
      const acc = accounts.find((a) => a.id === tr.input_vat_account_id);
      if (acc) taxDebit = suggestionForAccount(acc);
    }
  }
  return {
    debit_account: suggestionForAccount(debit),
    credit_account: suggestionForAccount(ap),
    tax_debit_account: taxDebit,
    tax_credit_account: undefined,
  };
}

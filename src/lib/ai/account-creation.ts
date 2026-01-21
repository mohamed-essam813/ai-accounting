/**
 * Auto-create missing accounts silently
 * Part of stateful prompt resolution pipeline
 * Fixes bug where prompt execution stops after account creation confirmation
 */

import { createAccountAction } from "@/lib/actions/accounts";
import { generateAccountCode } from "@/lib/accounting/generate-account-code";
import { listAccounts } from "@/lib/data/accounts";

type AccountSuggestion = {
  suggested_name?: string;
  suggested_type?: "asset" | "liability" | "equity" | "revenue" | "expense";
  suggested_code?: string;
  suggested_category?: "current" | "non_current" | null;
  existing_account_id?: string | null;
};

type AccountsFromAI = {
  debit_account?: AccountSuggestion;
  credit_account?: AccountSuggestion;
  tax_debit_account?: AccountSuggestion;
  tax_credit_account?: AccountSuggestion;
};

export type CreatedAccount = {
  id: string;
  name: string;
  code: string;
  type: string;
};

/**
 * Auto-create missing accounts silently (no blocking confirmation)
 * Returns list of created accounts
 */
export async function autoCreateMissingAccounts(
  accounts: AccountsFromAI,
  tenantId: string,
): Promise<CreatedAccount[]> {
  const created: CreatedAccount[] = [];

  // Check each account and create if needed
  const accountsToCheck = [
    { key: "debit_account", account: accounts.debit_account },
    { key: "credit_account", account: accounts.credit_account },
    { key: "tax_debit_account", account: accounts.tax_debit_account },
    { key: "tax_credit_account", account: accounts.tax_credit_account },
  ];

  for (const { account } of accountsToCheck) {
    if (!account?.suggested_name || account.existing_account_id) {
      continue; // Skip if no name suggested or account already exists
    }

    // Check if account exists by name (case-insensitive)
    const allAccounts = await listAccounts();
    const exists = allAccounts.some(
      (a) => a.name.toLowerCase() === account.suggested_name!.toLowerCase(),
    );

    if (!exists && account.suggested_type) {
      // Auto-create account silently
      try {
        const code = account.suggested_code || await generateAccountCode(
          account.suggested_type,
          tenantId,
          account.suggested_category ?? undefined,
        );

        const newAccount = await createAccountAction({
          name: account.suggested_name,
          code,
          type: account.suggested_type,
          category: account.suggested_category ?? undefined,
        });

        created.push({
          id: newAccount.id,
          name: newAccount.name,
          code: newAccount.code,
          type: newAccount.type,
        });
      } catch (error) {
        console.error(`Failed to auto-create account ${account.suggested_name}:`, error);
        // Continue - don't block on account creation failure
      }
    }
  }

  return created;
}

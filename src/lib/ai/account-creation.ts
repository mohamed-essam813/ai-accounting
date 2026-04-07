/**
 * Auto-create missing accounts in the prompt pipeline — prefers mapping to existing CoA
 * (normalized name + fuzzy match) before inserting, to avoid silent duplicates.
 */

import { createAccountAction } from "@/lib/actions/accounts";
import { generateAccountCode } from "@/lib/accounting/generate-account-code";
import { accountNameSimilarityScore, AI_MAP_EXISTING_MIN_SCORE } from "@/lib/accounts/account-name-similarity";
import { listAccounts } from "@/lib/data/accounts";
import { normalizeAccountUniquenessKey } from "@/lib/utils/entity-dedupe";

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

type ListAccount = Awaited<ReturnType<typeof listAccounts>>[number];

function findExistingForAiSuggestion(
  suggestedName: string,
  accountType: ListAccount["type"],
  allAccounts: ListAccount[],
): ListAccount | null {
  const key = normalizeAccountUniquenessKey(suggestedName);
  const candidates = allAccounts.filter((a) => a.type === accountType && a.is_active !== false);
  const exactKey = candidates.find((a) => normalizeAccountUniquenessKey(a.name) === key);
  if (exactKey) return exactKey;

  let best: ListAccount | null = null;
  let bestScore = 0;
  for (const a of candidates) {
    const s = accountNameSimilarityScore(suggestedName, a.name);
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  if (best && bestScore >= AI_MAP_EXISTING_MIN_SCORE) return best;
  return null;
}

/**
 * Ensures suggested accounts exist: maps to existing CoA when similar, otherwise creates.
 * Returns both newly created and matched existing accounts so callers can re-parse the prompt.
 */
export async function autoCreateMissingAccounts(
  accounts: AccountsFromAI,
  tenantId: string,
): Promise<CreatedAccount[]> {
  const resolved: CreatedAccount[] = [];
  let allAccounts = await listAccounts();

  const accountsToCheck = [
    { key: "debit_account", account: accounts.debit_account },
    { key: "credit_account", account: accounts.credit_account },
    { key: "tax_debit_account", account: accounts.tax_debit_account },
    { key: "tax_credit_account", account: accounts.tax_credit_account },
  ];

  for (const { account } of accountsToCheck) {
    if (!account?.suggested_name || account.existing_account_id) {
      continue;
    }

    const suggestedType = account.suggested_type;
    if (!suggestedType) continue;

    const existing = findExistingForAiSuggestion(account.suggested_name, suggestedType, allAccounts);
    if (existing) {
      resolved.push({
        id: existing.id,
        name: existing.name,
        code: existing.code,
        type: existing.type,
      });
      continue;
    }

    try {
      const code =
        account.suggested_code ||
        (await generateAccountCode(suggestedType, tenantId, account.suggested_category ?? undefined));

      const newAccount = await createAccountAction({
        name: account.suggested_name,
        code,
        type: suggestedType,
        category: account.suggested_category ?? undefined,
      });

      resolved.push({
        id: newAccount.id,
        name: newAccount.name,
        code: newAccount.code,
        type: newAccount.type,
      });
      allAccounts = await listAccounts();
    } catch (error) {
      console.error(`Failed to auto-create account ${account.suggested_name}:`, error);
    }
  }

  return resolved;
}

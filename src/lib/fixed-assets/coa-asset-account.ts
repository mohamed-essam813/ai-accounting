import type { Account } from "@/lib/accounting";

/** Chart row is a PPE / fixed-asset ledger account (IFRS — capitalized to non-current PPE). */
export function isFixedAssetChartAccount(account: {
  type: string;
  detail_type: string | null;
}): boolean {
  return account.type === "asset" && account.detail_type === "fixed_asset";
}

/** Active CoA accounts that may be used as the capitalization target for manual / bill fixed assets. */
export function filterFixedAssetCapitalizationAccounts(accounts: Account[]): Account[] {
  return accounts
    .filter((a) => a.is_active && isFixedAssetChartAccount(a))
    .sort((a, b) => a.code.localeCompare(b.code));
}

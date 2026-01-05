/**
 * Helper functions to identify Cash/Bank accounts
 * Bank reconciliation must only work with Cash/Bank accounts (codes 1000-1099)
 */

import type { Account } from "../accounting";

/**
 * Check if an account is a Cash/Bank account
 * Cash/Bank accounts are asset accounts with codes 1000-1099
 */
export function isBankAccount(account: Account): boolean {
  // Must be an asset account
  if (account.type !== "asset") {
    return false;
  }

  // Parse code as number to check range
  const codeNum = parseInt(account.code, 10);
  
  // Cash/Bank accounts are in the 1000-1099 range
  // This includes: 1000 (Cash), 1010-1099 (various bank accounts)
  return codeNum >= 1000 && codeNum < 1100;
}

/**
 * Filter accounts to only Cash/Bank accounts
 */
export function filterBankAccounts(accounts: Account[]): Account[] {
  return accounts.filter(isBankAccount);
}

/**
 * Validate that an account ID is a Cash/Bank account
 * Throws an error if the account is not a Cash/Bank account
 */
export function validateBankAccount(account: Account, accountId: string): void {
  if (account.id !== accountId) {
    throw new Error(`Account ${accountId} not found`);
  }
  
  if (!isBankAccount(account)) {
    throw new Error(
      `Account ${account.code} (${account.name}) is not a Cash/Bank account. ` +
      `Only accounts with codes 1000-1099 can be used for bank reconciliation.`
    );
  }
}


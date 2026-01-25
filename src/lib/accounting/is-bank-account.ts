/**
 * Helper functions to identify Cash/Bank accounts
 * Bank reconciliation (Doc 13) must use ONLY bank accounts—exclude Cash, Petty Cash, etc.
 */

import type { Account } from "../accounting";

/**
 * Check if an account is a Cash/Bank account (code range 1000-1099).
 * Used for prompt flow cash/bank selection.
 */
export function isBankAccount(account: Account): boolean {
  if (account.type !== "asset") return false;
  if ("is_active" in account && account.is_active === false) return false;
  const codeNum = parseInt(account.code, 10);
  return codeNum >= 1000 && codeNum < 1100;
}

/**
 * Check if an account is eligible for bank reconciliation (BANK only).
 * Excludes Cash (1000), Petty Cash (1005), and other non-bank current assets.
 * Only 1010-1099 are treated as bank accounts with external statements.
 */
export function isBankReconciliationEligible(account: Account): boolean {
  if (!isBankAccount(account)) return false;
  const codeNum = parseInt(account.code, 10);
  return codeNum >= 1010 && codeNum < 1100;
}

/**
 * Filter accounts to Cash/Bank (1000-1099). Use for prompt cash/bank selection.
 */
export function filterBankAccounts(accounts: Account[]): Account[] {
  return accounts.filter(isBankAccount);
}

/**
 * Filter accounts to bank-reconciliation-eligible only (BANK, exclude Cash).
 * Use for Bank Reconciliation module (Doc 13).
 */
export function filterBankReconciliationAccounts(accounts: Account[]): Account[] {
  return accounts.filter(isBankReconciliationEligible);
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

/**
 * Validate that an account is bank-reconciliation eligible (BANK only, exclude Cash).
 * Doc 13: "Only bank accounts can be reconciled. Cash accounts do not support reconciliation."
 */
export function validateBankReconciliationAccount(account: Account, accountId: string): void {
  if (account.id !== accountId) {
    throw new Error(`Account ${accountId} not found`);
  }
  if (!isBankReconciliationEligible(account)) {
    throw new Error(
      "Only bank accounts can be reconciled. Cash accounts do not support reconciliation."
    );
  }
}


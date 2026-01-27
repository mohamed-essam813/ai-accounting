/**
 * Helper functions to identify Cash/Bank accounts
 * Bank reconciliation must use ONLY bank accounts (detail_type='bank' AND allow_reconciliation=true).
 * Exclude Cash, Petty Cash, etc.
 */

import type { Account } from "../accounting";

// Extended Account type to include new fields (may not be in database types yet)
type AccountWithDetailType = Account & {
  detail_type?: "bank" | "cash" | "other_current_asset" | "fixed_asset" | "other" | null;
  allow_reconciliation?: boolean | null;
};

/**
 * Check if an account is a Cash/Bank account.
 * Uses detail_type if available, falls back to code range for backward compatibility.
 */
export function isBankAccount(account: Account): boolean {
  if (account.type !== "asset") return false;
  if ("is_active" in account && account.is_active === false) return false;
  
  const acc = account as AccountWithDetailType;
  
  // Check detail_type first (preferred method)
  if (acc.detail_type) {
    return acc.detail_type === "bank" || acc.detail_type === "cash";
  }
  
  // Fallback to code range for backward compatibility
  const codeNum = parseInt(account.code, 10);
  return codeNum >= 1000 && codeNum < 1100;
}

/**
 * Check if an account is eligible for bank reconciliation (BANK only).
 * Uses detail_type='bank' AND allow_reconciliation=true.
 * Excludes Cash, Petty Cash, and other non-bank current assets.
 */
export function isBankReconciliationEligible(account: Account): boolean {
  if (account.type !== "asset") return false;
  if ("is_active" in account && account.is_active === false) return false;
  
  const acc = account as AccountWithDetailType;
  
  // Check detail_type and allow_reconciliation (preferred method)
  if (acc.detail_type === "bank") {
    if (acc.allow_reconciliation !== undefined && acc.allow_reconciliation !== null) {
      return acc.allow_reconciliation === true;
    }
    return true; // If allow_reconciliation not set, assume true for bank accounts
  }
  
  // Fallback to code range for backward compatibility (1010-1099)
  const codeNum = parseInt(account.code, 10);
  return codeNum >= 1010 && codeNum < 1100;
}

/**
 * Filter accounts to Cash/Bank (1000-1099). Use for prompt cash/bank selection.
 * Works with base Account type, handles optional detail_type internally.
 */
export function filterBankAccounts(accounts: Account[]): Account[] {
  return accounts.filter((acc) => {
    const accWithDetail = acc as AccountWithDetailType;
    return isBankAccount(accWithDetail);
  });
}

/**
 * Filter accounts to bank-reconciliation-eligible only (BANK, exclude Cash).
 * Uses detail_type='bank' AND allow_reconciliation=true.
 * Use for Bank Reconciliation module.
 */
export function filterBankReconciliationAccounts(accounts: Account[]): Account[] {
  return accounts.filter((acc) => {
    // Type guard: check if account has new fields
    const accWithDetail = acc as AccountWithDetailType;
    return isBankReconciliationEligible(accWithDetail);
  });
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
 * Only bank accounts can be reconciled. Cash accounts do not support reconciliation.
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


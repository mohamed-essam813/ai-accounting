/**
 * GL Mapping Validation
 * Implements account type constraints per feedback document
 * Ensures AI cannot post without valid mapping
 */

import type { Account } from "../accounting";
import type { DraftPayload } from "../ai/schema";
import type { IntentAccountMapping } from "../accounting";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type IntentMappingRules = {
  intent: DraftPayload["intent"];
  debitAccountTypes: AccountType[];
  creditAccountTypes: AccountType[];
  taxDebitAccountTypes?: AccountType[];
  taxCreditAccountTypes?: AccountType[];
  taxDebitRestrictions?: string[]; // Account codes that are NOT allowed
  taxCreditRestrictions?: string[]; // Account codes that are NOT allowed
};

/**
 * Account type validation rules per intent (from feedback)
 */
export const INTENT_MAPPING_RULES: Record<DraftPayload["intent"], IntentMappingRules> = {
  create_invoice: {
    intent: "create_invoice",
    debitAccountTypes: ["asset"], // Must be AR-type (asset, code 11xx)
    creditAccountTypes: ["revenue"], // Must be Revenue-type
    taxDebitAccountTypes: [], // Optional, not typically used for invoices
    taxCreditAccountTypes: ["liability"], // VAT Output (must be liability, NOT cash)
    taxCreditRestrictions: ["1000"], // Tax credit must NOT be Cash
  },
  create_bill: {
    intent: "create_bill",
    debitAccountTypes: ["expense", "asset"], // Expense or Asset (inventory/fixed assets)
    creditAccountTypes: ["liability"], // Must be AP-type (liability, code 20xx)
    taxDebitAccountTypes: ["asset"], // Input Tax (asset, code 51xx)
    taxCreditAccountTypes: [], // Not allowed for bills
    taxDebitRestrictions: ["1000"], // Tax debit must NOT be Cash
  },
  record_payment: {
    intent: "record_payment",
    debitAccountTypes: ["asset"], // Cash/Bank (asset, code 10xx)
    creditAccountTypes: ["asset"], // AR (asset, code 11xx) for customer payment
    taxDebitAccountTypes: [], // Tax accounts must not be involved
    taxCreditAccountTypes: [], // Tax accounts must not be involved
  },
  create_credit_note: {
    intent: "create_credit_note",
    debitAccountTypes: ["revenue"], // Revenue reversal
    creditAccountTypes: ["asset"], // AR (asset, code 11xx)
    taxDebitAccountTypes: ["liability"], // Reverse Output Tax (liability)
    taxCreditAccountTypes: [],
    taxDebitRestrictions: ["1000"], // Tax must NOT be Cash
  },
  create_debit_note: {
    intent: "create_debit_note",
    debitAccountTypes: ["liability"], // AP (liability, code 20xx)
    creditAccountTypes: ["expense", "asset"], // Expense or Asset
    taxDebitAccountTypes: [],
    taxCreditAccountTypes: ["asset"], // Input Tax (asset, code 51xx)
    taxCreditRestrictions: ["1000"], // Tax must NOT be Cash
  },
  reconcile_bank: {
    intent: "reconcile_bank",
    debitAccountTypes: ["asset"], // Bank/Cash account (asset)
    creditAccountTypes: ["asset", "liability", "equity"], // Can be AR/AP (asset), Loan (liability), or Capital (equity)
    taxDebitAccountTypes: [],
    taxCreditAccountTypes: [],
  },
  generate_report: {
    intent: "generate_report",
    debitAccountTypes: [],
    creditAccountTypes: [],
    taxDebitAccountTypes: [],
    taxCreditAccountTypes: [],
  },
};

/**
 * Validate that an account matches the required type for an intent
 */
export function validateAccountType(
  account: Account,
  requiredTypes: AccountType[],
  restrictions?: string[]
): { valid: boolean; error?: string } {
  // Check if account type is allowed
  if (!requiredTypes.includes(account.type as AccountType)) {
    return {
      valid: false,
      error: `Account ${account.code} (${account.name}) has type "${account.type}" but must be one of: ${requiredTypes.join(", ")}`,
    };
  }

  // Check restrictions (e.g., tax credit must NOT be cash)
  if (restrictions && restrictions.includes(account.code)) {
    return {
      valid: false,
      error: `Account ${account.code} (${account.name}) is restricted for this intent`,
    };
  }

  return { valid: true };
}

/**
 * Validate a complete intent mapping against the rules
 */
export function validateIntentMapping(
  mapping: IntentAccountMapping,
  accounts: Account[],
  intent: DraftPayload["intent"]
): { valid: boolean; errors: string[] } {
  const rules = INTENT_MAPPING_RULES[intent];
  if (!rules) {
    return {
      valid: false,
      errors: [`No validation rules defined for intent: ${intent}`],
    };
  }

  const errors: string[] = [];
  const accountMap = new Map(accounts.map((acc) => [acc.id, acc]));

  // Validate debit account
  const debitAccount = accountMap.get(mapping.debit_account_id);
  if (!debitAccount) {
    errors.push(`Debit account ${mapping.debit_account_id} not found in chart of accounts`);
  } else {
    const debitValidation = validateAccountType(debitAccount, rules.debitAccountTypes);
    if (!debitValidation.valid) {
      errors.push(`Debit account: ${debitValidation.error}`);
    }
  }

  // Validate credit account
  const creditAccount = accountMap.get(mapping.credit_account_id);
  if (!creditAccount) {
    errors.push(`Credit account ${mapping.credit_account_id} not found in chart of accounts`);
  } else {
    const creditValidation = validateAccountType(creditAccount, rules.creditAccountTypes);
    if (!creditValidation.valid) {
      errors.push(`Credit account: ${creditValidation.error}`);
    }
  }

  // Validate tax debit account (if provided)
  if (mapping.tax_debit_account_id) {
    const taxDebitAccount = accountMap.get(mapping.tax_debit_account_id);
    if (!taxDebitAccount) {
      errors.push(`Tax debit account ${mapping.tax_debit_account_id} not found in chart of accounts`);
    } else {
      if (rules.taxDebitAccountTypes && rules.taxDebitAccountTypes.length > 0) {
        const taxDebitValidation = validateAccountType(
          taxDebitAccount,
          rules.taxDebitAccountTypes,
          rules.taxDebitRestrictions
        );
        if (!taxDebitValidation.valid) {
          errors.push(`Tax debit account: ${taxDebitValidation.error}`);
        }
      } else {
        errors.push(`Tax debit account is not allowed for intent: ${intent}`);
      }
    }
  }

  // Validate tax credit account (if provided)
  if (mapping.tax_credit_account_id) {
    const taxCreditAccount = accountMap.get(mapping.tax_credit_account_id);
    if (!taxCreditAccount) {
      errors.push(`Tax credit account ${mapping.tax_credit_account_id} not found in chart of accounts`);
    } else {
      if (rules.taxCreditAccountTypes && rules.taxCreditAccountTypes.length > 0) {
        const taxCreditValidation = validateAccountType(
          taxCreditAccount,
          rules.taxCreditAccountTypes,
          rules.taxCreditRestrictions
        );
        if (!taxCreditValidation.valid) {
          errors.push(`Tax credit account: ${taxCreditValidation.error}`);
        }
        // Special check: Tax credit for invoices must NOT be cash
        if (intent === "create_invoice" && taxCreditAccount.code === "1000") {
          errors.push(`Tax credit account cannot be Cash (1000) for invoices. VAT Output must be a liability account.`);
        }
      } else {
        errors.push(`Tax credit account is not allowed for intent: ${intent}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a mapping is required for an intent
 */
export function isMappingRequired(intent: DraftPayload["intent"]): boolean {
  return intent !== "generate_report" && intent !== "reconcile_bank";
}

/**
 * Get allowed account types for a specific intent and side (debit/credit/tax)
 */
export function getAllowedAccountTypes(
  intent: DraftPayload["intent"],
  side: "debit" | "credit" | "taxDebit" | "taxCredit"
): AccountType[] {
  const rules = INTENT_MAPPING_RULES[intent];
  if (!rules) return [];

  switch (side) {
    case "debit":
      return rules.debitAccountTypes;
    case "credit":
      return rules.creditAccountTypes;
    case "taxDebit":
      return rules.taxDebitAccountTypes ?? [];
    case "taxCredit":
      return rules.taxCreditAccountTypes ?? [];
    default:
      return [];
  }
}

/**
 * Get restricted account codes for a specific intent and side
 */
export function getRestrictedAccountCodes(
  intent: DraftPayload["intent"],
  side: "taxDebit" | "taxCredit"
): string[] {
  const rules = INTENT_MAPPING_RULES[intent];
  if (!rules) return [];

  switch (side) {
    case "taxDebit":
      return rules.taxDebitRestrictions ?? [];
    case "taxCredit":
      return rules.taxCreditRestrictions ?? [];
    default:
      return [];
  }
}


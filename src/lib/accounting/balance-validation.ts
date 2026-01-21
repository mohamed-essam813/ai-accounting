/**
 * Balance Sheet Validation
 * 
 * Validates that Assets = Liabilities + Equity
 * If imbalance exists, identifies offending entries and suggests corrective actions
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";

export interface BalanceSheetValidationResult {
  isBalanced: boolean;
  assets: number;
  liabilities: number;
  equity: number;
  liabilitiesAndEquity: number;
  difference: number;
  offendingEntries?: Array<{
    accountCode: string;
    accountName: string;
    balance: number;
    type: "asset" | "liability" | "equity";
    suggestedAction?: string;
  }>;
  suggestions?: string[];
}

/**
 * Validate balance sheet equation: Assets = Liabilities + Equity
 */
export async function validateBalanceSheet(): Promise<BalanceSheetValidationResult> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      isBalanced: false,
      assets: 0,
      liabilities: 0,
      equity: 0,
      liabilitiesAndEquity: 0,
      difference: 0,
      suggestions: ["Unable to validate: User tenant not found"],
    };
  }

  const supabase = await createServerSupabaseClient();
  
  // Get trial balance to calculate totals
  const { data: trialBalance, error } = await supabase
    .from("v_trial_balance")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("code");

  if (error) {
    throw error;
  }

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  const accountBalances: Array<{
    accountCode: string;
    accountName: string;
    balance: number;
    type: "asset" | "liability" | "equity";
  }> = [];

  (trialBalance || []).forEach((account) => {
    const code = parseInt(account.code || "0", 10);
    const type = account.type;
    
    let balance = 0;
    if (type === "asset") {
      balance = Number(account.total_debit ?? 0) - Number(account.total_credit ?? 0);
      totalAssets += balance;
    } else if (type === "liability") {
      balance = Number(account.total_credit ?? 0) - Number(account.total_debit ?? 0);
      totalLiabilities += balance;
    } else if (type === "equity") {
      balance = Number(account.total_credit ?? 0) - Number(account.total_debit ?? 0);
      totalEquity += balance;
    }

    if (balance !== 0) {
      accountBalances.push({
        accountCode: account.code || "",
        accountName: account.name || "",
        balance,
        type: type as "asset" | "liability" | "equity",
      });
    }
  });

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const difference = Math.abs(totalAssets - totalLiabilitiesAndEquity);
  const isBalanced = difference < 0.01; // Allow for rounding differences

  // If not balanced, identify potential offending entries
  let offendingEntries: BalanceSheetValidationResult["offendingEntries"] = [];
  let suggestions: string[] = [];

  if (!isBalanced) {
    // Find accounts with largest imbalances that might be causing the issue
    const sortedByAbsBalance = [...accountBalances]
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
      .slice(0, 10); // Top 10 accounts by absolute balance

    offendingEntries = sortedByAbsBalance.map((account) => {
      let suggestedAction: string | undefined;
      
      // Provide suggestions based on account type and balance
      if (account.type === "asset" && account.balance < 0) {
        suggestedAction = `Negative asset balance detected. Check for incorrect postings or missing transactions. Review account ${account.accountCode} (${account.accountName}).`;
      } else if ((account.type === "liability" || account.type === "equity") && account.balance < 0) {
        suggestedAction = `Negative ${account.type} balance detected. This may indicate incorrect account classification or posting errors. Review account ${account.accountCode} (${account.accountName}).`;
      } else if (Math.abs(account.balance) > difference * 0.5) {
        suggestedAction = `Large balance in this account (${account.accountCode}) may be contributing to the imbalance. Verify all transactions are correctly posted.`;
      }

      return {
        ...account,
        suggestedAction,
      };
    });

    // Generate AI-powered suggestions
    suggestions = generateBalanceSheetSuggestions(
      difference,
      totalAssets,
      totalLiabilitiesAndEquity,
      offendingEntries,
    );
  }

  return {
    isBalanced,
    assets: totalAssets,
    liabilities: totalLiabilities,
    equity: totalEquity,
    liabilitiesAndEquity: totalLiabilitiesAndEquity,
    difference,
    offendingEntries: offendingEntries.length > 0 ? offendingEntries : undefined,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Generate AI-powered suggestions for fixing balance sheet imbalance
 */
function generateBalanceSheetSuggestions(
  difference: number,
  assets: number,
  liabilitiesAndEquity: number,
  offendingEntries: BalanceSheetValidationResult["offendingEntries"],
): string[] {
  const suggestions: string[] = [];
  const differencePercent = Math.abs(difference / Math.max(assets, liabilitiesAndEquity, 1)) * 100;

  // Main issue description
  if (assets > liabilitiesAndEquity) {
    suggestions.push(
      `Balance sheet is out of balance by ${formatCurrency(difference)}. Assets exceed Liabilities + Equity, indicating missing liability/equity entries or overstated assets.`,
    );
  } else {
    suggestions.push(
      `Balance sheet is out of balance by ${formatCurrency(difference)}. Liabilities + Equity exceed Assets, indicating missing asset entries or overstated liabilities/equity.`,
    );
  }

  // Severity assessment
  if (differencePercent > 10) {
    suggestions.push(
      `⚠️ CRITICAL: The imbalance represents ${differencePercent.toFixed(1)}% of total assets. This is a significant error that must be resolved before financial statements can be relied upon.`,
    );
  } else if (differencePercent > 1) {
    suggestions.push(
      `⚠️ WARNING: The imbalance represents ${differencePercent.toFixed(1)}% of total assets. Review all recent transactions for posting errors.`,
    );
  } else {
    suggestions.push(
      `The imbalance is relatively small (${differencePercent.toFixed(2)}%). This may be due to rounding differences or a minor posting error.`,
    );
  }

  // Specific account suggestions
  if (offendingEntries && offendingEntries.length > 0) {
    const topOffenders = offendingEntries.slice(0, 3);
    suggestions.push(
      `Top accounts to review: ${topOffenders.map((e) => `${e.accountName} (${e.accountCode})`).join(", ")}.`,
    );
  }

  // Action items
  suggestions.push(
    `Recommended actions: 1) Review all journal entries posted in the last 30 days, 2) Verify all accounts are correctly classified, 3) Check for unposted drafts or missing transactions, 4) Ensure all double-entry postings are balanced.`,
  );

  return suggestions;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Balance Sheet Validation
 *
 * Uses the same engine as the detailed balance sheet: assets = liabilities + equity,
 * where equity includes cumulative P&L (net income) and optional system balancing line.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { computeBalanceSheetEquation } from "@/lib/accounting/balance-sheet-compute";

export interface BalanceSheetValidationResult {
  isBalanced: boolean;
  assets: number;
  liabilities: number;
  /** Total equity including net income (P&L) and any system adjustment line. */
  equity: number;
  /** Equity from chart accounts typed as equity only (excludes synthetic P&L lines). */
  equityChartAccounts: number;
  netProfit: number;
  balancingAdjustment: number;
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
 * Validate balance sheet equation: Assets = Liabilities + Equity (with P&L in equity).
 */
export async function validateBalanceSheet(): Promise<BalanceSheetValidationResult> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      isBalanced: false,
      assets: 0,
      liabilities: 0,
      equity: 0,
      equityChartAccounts: 0,
      netProfit: 0,
      balancingAdjustment: 0,
      liabilitiesAndEquity: 0,
      difference: 0,
      suggestions: ["Unable to validate: User tenant not found"],
    } satisfies BalanceSheetValidationResult;
  }

  const supabase = await createServerSupabaseClient();

  const { data: trialBalance, error } = await supabase
    .from("v_trial_balance")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("code");

  if (error) {
    throw error;
  }

  const eq = computeBalanceSheetEquation((trialBalance ?? []) as never, { tenantId: user.tenant.id });

  const accountBalances: NonNullable<BalanceSheetValidationResult["offendingEntries"]> = [];
  (trialBalance || []).forEach((account) => {
    const type = account.type;
    if (type !== "asset" && type !== "liability" && type !== "equity") return;

    let balance = 0;
    if (type === "asset") {
      balance = Number(account.total_debit ?? 0) - Number(account.total_credit ?? 0);
    } else {
      balance = Number(account.total_credit ?? 0) - Number(account.total_debit ?? 0);
    }

    if (balance === 0) return;

    accountBalances.push({
      accountCode: account.code || "",
      accountName: account.name || "",
      balance,
      type: type as "asset" | "liability" | "equity",
    });
  });

  let offendingEntries: BalanceSheetValidationResult["offendingEntries"];
  let suggestions: string[] | undefined;

  if (!eq.isBalanced) {
    const sortedByAbsBalance = [...accountBalances]
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
      .slice(0, 10);

    offendingEntries = sortedByAbsBalance.map((account) => {
      let suggestedAction: string | undefined;
      if (account.type === "asset" && account.balance < 0) {
        suggestedAction = `Negative asset balance. Review postings or classification for ${account.accountCode} (${account.accountName}).`;
      } else if ((account.type === "liability" || account.type === "equity") && account.balance < 0) {
        suggestedAction = `Negative ${account.type} balance. Review ${account.accountCode} (${account.accountName}).`;
      } else if (Math.abs(account.balance) > eq.difference * 0.5) {
        suggestedAction = `Large balance — verify transactions for ${account.accountCode}.`;
      }
      return { ...account, suggestedAction };
    });

    suggestions = generateBalanceSheetSuggestions(eq.difference, eq.assets, eq.liabilitiesAndEquity, offendingEntries);
  }

  return {
    isBalanced: eq.isBalanced,
    assets: eq.assets,
    liabilities: eq.liabilities,
    equity: eq.totalEquity,
    equityChartAccounts: eq.equityChartAccounts,
    netProfit: eq.netProfit,
    balancingAdjustment: eq.balancingAdjustment,
    liabilitiesAndEquity: eq.liabilitiesAndEquity,
    difference: eq.difference,
    offendingEntries: offendingEntries && offendingEntries.length > 0 ? offendingEntries : undefined,
    suggestions: suggestions && suggestions.length > 0 ? suggestions : undefined,
  };
}

function generateBalanceSheetSuggestions(
  difference: number,
  assets: number,
  liabilitiesAndEquity: number,
  offendingEntries: BalanceSheetValidationResult["offendingEntries"],
): string[] {
  const suggestions: string[] = [];
  const differencePercent = Math.abs(difference / Math.max(assets, liabilitiesAndEquity, 1)) * 100;

  if (assets > liabilitiesAndEquity) {
    suggestions.push(
      `Balance sheet gap ${formatCurrency(difference)}: assets exceed liabilities + equity after including P&L. Review classifications and journal integrity.`,
    );
  } else if (assets < liabilitiesAndEquity) {
    suggestions.push(
      `Balance sheet gap ${formatCurrency(difference)}: liabilities + equity exceed assets. Review classifications and journal integrity.`,
    );
  }

  if (differencePercent > 10) {
    suggestions.push(
      `The gap is about ${differencePercent.toFixed(1)}% of totals — review material accounts and owner-equity overrides (balance_sheet_role).`,
    );
  }

  if (offendingEntries && offendingEntries.length > 0) {
    const topOffenders = offendingEntries.slice(0, 3);
    suggestions.push(
      `Largest balances: ${topOffenders.map((e) => `${e.accountName} (${e.accountCode})`).join(", ")}.`,
    );
  }

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

/**
 * Detailed Report Data Functions
 * Returns line-item data for proper financial reports (not just summaries)
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "../database.types";

type TrialBalance = Database["public"]["Views"]["v_trial_balance"]["Row"];

export interface PLLineItem {
  account_code: string;
  account_name: string;
  amount: number;
  section: "revenue" | "cost_of_sales" | "operating_expenses" | "other_income" | "gain_loss";
}

export interface BalanceSheetLineItem {
  account_code: string;
  account_name: string;
  amount: number;
  section: "current_assets" | "non_current_assets" | "current_liabilities" | "non_current_liabilities" | "equity";
  category?: "current" | "non_current";
}

export interface CashFlowLineItem {
  account_code: string;
  account_name: string;
  amount: number;
  section: "operating" | "investing" | "financing";
}

/**
 * Get detailed Profit & Loss line items
 */
export async function getDetailedProfitAndLoss(): Promise<{
  revenue: PLLineItem[];
  costOfSales: PLLineItem[];
  operatingExpenses: PLLineItem[];
  otherIncome: PLLineItem[];
  gainLoss: PLLineItem[];
  totals: {
    totalRevenue: number;
    totalCostOfSales: number;
    grossProfit: number;
    totalOperatingExpenses: number;
    operatingProfit: number;
    totalOtherIncome: number;
    gainLossOnDisposal: number;
    netProfit: number;
  };
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      revenue: [],
      costOfSales: [],
      operatingExpenses: [],
      otherIncome: [],
      gainLoss: [],
      totals: {
        totalRevenue: 0,
        totalCostOfSales: 0,
        grossProfit: 0,
        totalOperatingExpenses: 0,
        operatingProfit: 0,
        totalOtherIncome: 0,
        gainLossOnDisposal: 0,
        netProfit: 0,
      },
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data: trialBalance, error } = await supabase
    .from("v_trial_balance")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("code");

  if (error) throw error;

  const revenue: PLLineItem[] = [];
  const costOfSales: PLLineItem[] = [];
  const operatingExpenses: PLLineItem[] = [];
  const otherIncome: PLLineItem[] = [];
  const gainLoss: PLLineItem[] = [];

  // Categorize accounts based on code ranges and types
  // Revenue: 4000-4999
  // Cost of Sales: 5000-5099 (typically)
  // Operating Expenses: 5100-5999
  // Other Income: 4200
  // Gain/Loss: 4200 (gain) or 5700/5900 (loss)

  (trialBalance || []).forEach((account) => {
    const code = parseInt(account.code || "0", 10);
    const type = account.type;
    const balance = type === "revenue" 
      ? (Number(account.total_credit ?? 0) - Number(account.total_debit ?? 0))
      : (Number(account.total_debit ?? 0) - Number(account.total_credit ?? 0));

    if (balance === 0) return; // Skip zero balances

    if (type === "revenue") {
      if (code === 4200) {
        // Other Income
        otherIncome.push({
          account_code: account.code || "",
          account_name: account.name || "",
          amount: balance,
          section: "other_income",
        });
      } else if (code >= 4000 && code < 5000) {
        // Revenue accounts
        revenue.push({
          account_code: account.code || "",
          account_name: account.name || "",
          amount: balance,
          section: "revenue",
        });
      }
    } else if (type === "expense") {
      if (code >= 5000 && code < 5100) {
        // Cost of Sales
        costOfSales.push({
          account_code: account.code || "",
          account_name: account.name || "",
          amount: balance,
          section: "cost_of_sales",
        });
      } else if (code === 5700 || code === 5900) {
        // Loss on disposal
        gainLoss.push({
          account_code: account.code || "",
          account_name: account.name || "",
          amount: -balance, // Loss is negative
          section: "gain_loss",
        });
      } else if (code >= 5100 && code < 6000) {
        // Operating Expenses
        operatingExpenses.push({
          account_code: account.code || "",
          account_name: account.name || "",
          amount: balance,
          section: "operating_expenses",
        });
      }
    }
  });

  // Calculate totals
  const totalRevenue = revenue.reduce((sum, item) => sum + item.amount, 0);
  const totalCostOfSales = costOfSales.reduce((sum, item) => sum + item.amount, 0);
  const grossProfit = totalRevenue - totalCostOfSales;
  const totalOperatingExpenses = operatingExpenses.reduce((sum, item) => sum + item.amount, 0);
  const operatingProfit = grossProfit - totalOperatingExpenses;
  const totalOtherIncome = otherIncome.reduce((sum, item) => sum + item.amount, 0);
  const gainLossOnDisposal = gainLoss.reduce((sum, item) => sum + item.amount, 0) + totalOtherIncome;
  const netProfit = operatingProfit + totalOtherIncome + gainLossOnDisposal;

  return {
    revenue,
    costOfSales,
    operatingExpenses,
    otherIncome,
    gainLoss,
    totals: {
      totalRevenue,
      totalCostOfSales,
      grossProfit,
      totalOperatingExpenses,
      operatingProfit,
      totalOtherIncome,
      gainLossOnDisposal,
      netProfit,
    },
  };
}

/**
 * Get detailed Balance Sheet line items
 */
export async function getDetailedBalanceSheet(): Promise<{
  currentAssets: BalanceSheetLineItem[];
  nonCurrentAssets: BalanceSheetLineItem[];
  currentLiabilities: BalanceSheetLineItem[];
  nonCurrentLiabilities: BalanceSheetLineItem[];
  equity: BalanceSheetLineItem[];
  totals: {
    totalCurrentAssets: number;
    totalNonCurrentAssets: number;
    totalAssets: number;
    totalCurrentLiabilities: number;
    totalNonCurrentLiabilities: number;
    totalLiabilities: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
  };
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      currentAssets: [],
      nonCurrentAssets: [],
      currentLiabilities: [],
      nonCurrentLiabilities: [],
      equity: [],
      totals: {
        totalCurrentAssets: 0,
        totalNonCurrentAssets: 0,
        totalAssets: 0,
        totalCurrentLiabilities: 0,
        totalNonCurrentLiabilities: 0,
        totalLiabilities: 0,
        totalEquity: 0,
        totalLiabilitiesAndEquity: 0,
      },
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data: trialBalance, error } = await supabase
    .from("v_trial_balance")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("code");

  if (error) throw error;

  const currentAssets: BalanceSheetLineItem[] = [];
  const nonCurrentAssets: BalanceSheetLineItem[] = [];
  const currentLiabilities: BalanceSheetLineItem[] = [];
  const nonCurrentLiabilities: BalanceSheetLineItem[] = [];
  const equity: BalanceSheetLineItem[] = [];

  (trialBalance || []).forEach((account) => {
    const code = parseInt(account.code || "0", 10);
    const type = account.type;
    
    // Get category from account (if available) or infer from code
    // Assets: 1000-1999 (Current: 1000-1099, Non-Current: 1100-1999)
    // Liabilities: 2000-2999 (Current: 2000-2099, Non-Current: 2100-2999)
    // Equity: 3000-3999

    let balance = 0;
    if (type === "asset") {
      balance = Number(account.total_debit ?? 0) - Number(account.total_credit ?? 0);
    } else if (type === "liability" || type === "equity") {
      balance = Number(account.total_credit ?? 0) - Number(account.total_debit ?? 0);
    }

    if (balance === 0) return; // Skip zero balances

    const item: BalanceSheetLineItem = {
      account_code: account.code || "",
      account_name: account.name || "",
      amount: balance,
      section: "current_assets", // Will be set below
      category: code >= 1000 && code < 1100 ? "current" : code >= 1100 && code < 2000 ? "non_current" : undefined,
    };

    if (type === "asset") {
      if (code >= 1000 && code < 1100) {
        // Current Assets (Cash/Bank)
        item.section = "current_assets";
        item.category = "current";
        currentAssets.push(item);
      } else if (code >= 1100 && code < 2000) {
        // Non-Current Assets
        item.section = "non_current_assets";
        item.category = "non_current";
        nonCurrentAssets.push(item);
      }
    } else if (type === "liability") {
      if (code >= 2000 && code < 2100) {
        // Current Liabilities
        item.section = "current_liabilities";
        item.category = "current";
        currentLiabilities.push(item);
      } else if (code >= 2100 && code < 3000) {
        // Non-Current Liabilities
        item.section = "non_current_liabilities";
        item.category = "non_current";
        nonCurrentLiabilities.push(item);
      }
    } else if (type === "equity") {
      item.section = "equity";
      equity.push(item);
    }
  });

  // Calculate totals
  const totalCurrentAssets = currentAssets.reduce((sum, item) => sum + item.amount, 0);
  const totalNonCurrentAssets = nonCurrentAssets.reduce((sum, item) => sum + item.amount, 0);
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
  const totalCurrentLiabilities = currentLiabilities.reduce((sum, item) => sum + item.amount, 0);
  const totalNonCurrentLiabilities = nonCurrentLiabilities.reduce((sum, item) => sum + item.amount, 0);
  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
  const totalEquity = equity.reduce((sum, item) => sum + item.amount, 0);
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return {
    currentAssets,
    nonCurrentAssets,
    currentLiabilities,
    nonCurrentLiabilities,
    equity,
    totals: {
      totalCurrentAssets,
      totalNonCurrentAssets,
      totalAssets,
      totalCurrentLiabilities,
      totalNonCurrentLiabilities,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity,
    },
  };
}

/**
 * Get detailed Cash Flow line items
 * Note: This is simplified for MVP. Full cash flow requires analyzing all transactions.
 */
export async function getDetailedCashFlow(): Promise<{
  operating: CashFlowLineItem[];
  investing: CashFlowLineItem[];
  financing: CashFlowLineItem[];
  totals: {
    operatingCashFlow: number;
    investingCashFlow: number;
    financingCashFlow: number;
    netCashFlow: number;
  };
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      operating: [],
      investing: [],
      financing: [],
      totals: {
        operatingCashFlow: 0,
        investingCashFlow: 0,
        financingCashFlow: 0,
        netCashFlow: 0,
      },
    };
  }

  const supabase = await createServerSupabaseClient();
  // For MVP, we'll use cash accounts (1000-1099) and categorize based on account codes
  // In a full implementation, this would analyze journal entries to determine cash flow activities
  const { data: trialBalance, error } = await supabase
    .from("v_trial_balance")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .gte("code", "1000")
    .lt("code", "1100")
    .order("code");

  if (error) throw error;

  const operating: CashFlowLineItem[] = [];
  const investing: CashFlowLineItem[] = [];
  const financing: CashFlowLineItem[] = [];

  // For MVP, we'll categorize cash accounts:
  // Operating: Main cash account (1000)
  // Investing: Investment accounts (if any)
  // Financing: Loan accounts (if any)
  // This is simplified - a full implementation would analyze transactions

  (trialBalance || []).forEach((account) => {
    const code = parseInt(account.code || "0", 10);
    const balance = Number(account.total_debit ?? 0) - Number(account.total_credit ?? 0);

    if (balance === 0) return;

    if (code === 1000) {
      // Main cash account - operating
      operating.push({
        account_code: account.code || "",
        account_name: account.name || "",
        amount: balance,
        section: "operating",
      });
    } else {
      // Other cash accounts - default to operating for MVP
      operating.push({
        account_code: account.code || "",
        account_name: account.name || "",
        amount: balance,
        section: "operating",
      });
    }
  });

  const operatingCashFlow = operating.reduce((sum, item) => sum + item.amount, 0);
  const investingCashFlow = investing.reduce((sum, item) => sum + item.amount, 0);
  const financingCashFlow = financing.reduce((sum, item) => sum + item.amount, 0);
  const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

  return {
    operating,
    investing,
    financing,
    totals: {
      operatingCashFlow,
      investingCashFlow,
      financingCashFlow,
      netCashFlow,
    },
  };
}


/**
 * Detailed Report Data Functions
 * Returns line-item data for proper financial reports (not just summaries)
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import { convertCurrency, getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import type { Database } from "../database.types";
import {
  classificationToPlSection,
  isAccountClassification,
  legacyInferPlSection,
  type PlLineSection,
} from "@/lib/accounting/account-classification";
import {
  isReportingClassification,
  reportingClassificationToPlSection,
} from "@/lib/accounting/reporting-classification";
import { computeBalanceSheetFromTrialBalance } from "@/lib/accounting/balance-sheet-compute";

type TrialBalance = Database["public"]["Views"]["v_trial_balance"]["Row"];

async function convertAmount(
  n: number,
  base: string,
  target: string,
  date: string,
  tenantId: string,
): Promise<number> {
  if (base.toUpperCase() === target.toUpperCase()) return n;
  return convertCurrency(n, base, target, date, tenantId);
}

export interface PLLineItem {
  account_code: string;
  account_name: string;
  amount: number;
  section: PlLineSection;
}

export interface BalanceSheetLineItem {
  account_code: string;
  account_name: string;
  amount: number;
  section: "current_assets" | "non_current_assets" | "current_liabilities" | "non_current_liabilities" | "equity";
  category?: "current" | "non_current";
  /** System lines (P&L net, balancing) — no ledger link. */
  isSynthetic?: boolean;
}

export interface CashFlowLineItem {
  account_code: string;
  account_name: string;
  amount: number;
  section: "operating" | "investing" | "financing";
}

/**
 * Get detailed Profit & Loss line items
 * @param targetCurrency Optional. When set with asOfDate, amounts are converted from base to this currency.
 * @param asOfDate Optional. Date used for FX (e.g. report period end). Defaults to today when converting.
 */
export async function getDetailedProfitAndLoss(
  targetCurrency?: string,
  asOfDate?: string,
): Promise<{
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

  (trialBalance || []).forEach((row) => {
    const account = row as TrialBalance & {
      account_classification?: string | null;
      reporting_classification?: string | null;
    };
    const type = account.type;
    const balance =
      type === "revenue"
        ? Number(account.total_credit ?? 0) - Number(account.total_debit ?? 0)
        : type === "expense"
          ? Number(account.total_debit ?? 0) - Number(account.total_credit ?? 0)
          : 0;

    if (balance === 0) return;

    let section: PlLineSection | null = null;
    if (account.reporting_classification && isReportingClassification(account.reporting_classification)) {
      section = reportingClassificationToPlSection(account.reporting_classification);
    } else if (account.account_classification && isAccountClassification(account.account_classification)) {
      section = classificationToPlSection(account.account_classification);
    } else {
      section = legacyInferPlSection({
        code: account.code || "",
        type: account.type ?? null,
        name: account.name ?? null,
      });
    }
    if (!section) return;

    const item: PLLineItem = {
      account_code: account.code || "",
      account_name: account.name || "",
      amount: balance,
      section,
    };

    switch (section) {
      case "revenue":
        revenue.push(item);
        break;
      case "cost_of_sales":
        costOfSales.push(item);
        break;
      case "operating_expenses":
        operatingExpenses.push(item);
        break;
      case "other_income":
        otherIncome.push(item);
        break;
      case "gain_loss":
        gainLoss.push(item);
        break;
      default:
        break;
    }
  });

  // Calculate totals
  const totalRevenue = revenue.reduce((sum, item) => sum + item.amount, 0);
  const totalCostOfSales = costOfSales.reduce((sum, item) => sum + item.amount, 0);
  const grossProfit = totalRevenue - totalCostOfSales;
  const totalOperatingExpenses = operatingExpenses.reduce((sum, item) => sum + item.amount, 0);
  const operatingProfit = grossProfit - totalOperatingExpenses;
  const totalOtherIncome = otherIncome.reduce((sum, item) => sum + item.amount, 0);
  const gainLossOnDisposal = gainLoss.reduce((sum, item) => sum + item.amount, 0);
  const netProfit = operatingProfit + totalOtherIncome + gainLossOnDisposal;

  if (targetCurrency && asOfDate && user.tenant) {
    const base = await getTenantBaseCurrency(user.tenant.id);
    const conv = (n: number) => convertAmount(n, base, targetCurrency, asOfDate, user.tenant!.id);
    const [revConv, cosConv, opeConv, othConv, gainConv, tr, tcs, gp, toe, op, tOi, gl, np] = await Promise.all([
      Promise.all(revenue.map((i) => conv(i.amount))),
      Promise.all(costOfSales.map((i) => conv(i.amount))),
      Promise.all(operatingExpenses.map((i) => conv(i.amount))),
      Promise.all(otherIncome.map((i) => conv(i.amount))),
      Promise.all(gainLoss.map((i) => conv(i.amount))),
      conv(totalRevenue),
      conv(totalCostOfSales),
      conv(grossProfit),
      conv(totalOperatingExpenses),
      conv(operatingProfit),
      conv(totalOtherIncome),
      conv(gainLossOnDisposal),
      conv(netProfit),
    ]);
    revenue.forEach((i, k) => { i.amount = revConv[k]!; });
    costOfSales.forEach((i, k) => { i.amount = cosConv[k]!; });
    operatingExpenses.forEach((i, k) => { i.amount = opeConv[k]!; });
    otherIncome.forEach((i, k) => { i.amount = othConv[k]!; });
    gainLoss.forEach((i, k) => { i.amount = gainConv[k]!; });
    return {
      revenue,
      costOfSales,
      operatingExpenses,
      otherIncome,
      gainLoss,
      totals: {
        totalRevenue: tr,
        totalCostOfSales: tcs,
        grossProfit: gp,
        totalOperatingExpenses: toe,
        operatingProfit: op,
        totalOtherIncome: tOi,
        gainLossOnDisposal: gl,
        netProfit: np,
      },
    };
  }

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
 * @param targetCurrency Optional. When set with asOfDate, amounts are converted from base to this currency.
 * @param asOfDate Optional. Date used for FX.
 */
export async function getDetailedBalanceSheet(
  targetCurrency?: string,
  asOfDate?: string,
): Promise<{
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
  /** Abnormal balances, classification notes. */
  warnings: string[];
  netProfitIncluded: number;
  balancingAdjustment: number;
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
      warnings: [],
      netProfitIncluded: 0,
      balancingAdjustment: 0,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data: trialBalance, error } = await supabase
    .from("v_trial_balance")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("code");

  if (error) throw error;

  const built = computeBalanceSheetFromTrialBalance((trialBalance ?? []) as never, {
    tenantId: user.tenant.id,
  });

  const sortByCode = (a: BalanceSheetLineItem, b: BalanceSheetLineItem) =>
    (a.account_code || "").localeCompare(b.account_code || "", undefined, { numeric: true });

  let currentAssets = built.currentAssets.map((i) => ({ ...i })) as BalanceSheetLineItem[];
  let nonCurrentAssets = built.nonCurrentAssets.map((i) => ({ ...i })) as BalanceSheetLineItem[];
  let currentLiabilities = built.currentLiabilities.map((i) => ({ ...i })) as BalanceSheetLineItem[];
  let nonCurrentLiabilities = built.nonCurrentLiabilities.map((i) => ({ ...i })) as BalanceSheetLineItem[];
  let equity = built.equity.map((i) => ({ ...i })) as BalanceSheetLineItem[];

  currentAssets.sort(sortByCode);
  nonCurrentAssets.sort(sortByCode);
  currentLiabilities.sort(sortByCode);
  nonCurrentLiabilities.sort(sortByCode);
  equity.sort(sortByCode);

  let totals = { ...built.totals };

  if (targetCurrency && asOfDate && user.tenant) {
    const base = await getTenantBaseCurrency(user.tenant.id);
    const conv = (n: number) => convertAmount(n, base, targetCurrency, asOfDate, user.tenant!.id);
    const [ca, nca, cl, ncl, eq, tca, tnca, ta, tcl, tncl, tl, te, tle] = await Promise.all([
      Promise.all(currentAssets.map((i) => conv(i.amount))),
      Promise.all(nonCurrentAssets.map((i) => conv(i.amount))),
      Promise.all(currentLiabilities.map((i) => conv(i.amount))),
      Promise.all(nonCurrentLiabilities.map((i) => conv(i.amount))),
      Promise.all(equity.map((i) => conv(i.amount))),
      conv(totals.totalCurrentAssets),
      conv(totals.totalNonCurrentAssets),
      conv(totals.totalAssets),
      conv(totals.totalCurrentLiabilities),
      conv(totals.totalNonCurrentLiabilities),
      conv(totals.totalLiabilities),
      conv(totals.totalEquity),
      conv(totals.totalLiabilitiesAndEquity),
    ]);
    currentAssets.forEach((i, k) => {
      i.amount = ca[k]!;
    });
    nonCurrentAssets.forEach((i, k) => {
      i.amount = nca[k]!;
    });
    currentLiabilities.forEach((i, k) => {
      i.amount = cl[k]!;
    });
    nonCurrentLiabilities.forEach((i, k) => {
      i.amount = ncl[k]!;
    });
    equity.forEach((i, k) => {
      i.amount = eq[k]!;
    });
    totals = {
      totalCurrentAssets: tca,
      totalNonCurrentAssets: tnca,
      totalAssets: ta,
      totalCurrentLiabilities: tcl,
      totalNonCurrentLiabilities: tncl,
      totalLiabilities: tl,
      totalEquity: te,
      totalLiabilitiesAndEquity: tle,
    };
  }

  return {
    currentAssets,
    nonCurrentAssets,
    currentLiabilities,
    nonCurrentLiabilities,
    equity,
    totals,
    warnings: built.warnings,
    netProfitIncluded: built.netProfitIncluded,
    balancingAdjustment: built.balancingAdjustment,
  };
}

/**
 * Get detailed Cash Flow line items
 * Note: This is simplified for MVP. Full cash flow requires analyzing all transactions.
 * @param targetCurrency Optional. When set with asOfDate, amounts are converted from base to this currency.
 * @param asOfDate Optional. Date used for FX.
 */
export async function getDetailedCashFlow(
  targetCurrency?: string,
  asOfDate?: string,
): Promise<{
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

  if (targetCurrency && asOfDate && user.tenant) {
    const base = await getTenantBaseCurrency(user.tenant.id);
    const conv = (n: number) => convertAmount(n, base, targetCurrency, asOfDate, user.tenant!.id);
    const [opConv, invConv, finConv, ocf, icf, fcf, ncf] = await Promise.all([
      Promise.all(operating.map((i) => conv(i.amount))),
      Promise.all(investing.map((i) => conv(i.amount))),
      Promise.all(financing.map((i) => conv(i.amount))),
      conv(operatingCashFlow),
      conv(investingCashFlow),
      conv(financingCashFlow),
      conv(netCashFlow),
    ]);
    operating.forEach((i, k) => { i.amount = opConv[k]!; });
    investing.forEach((i, k) => { i.amount = invConv[k]!; });
    financing.forEach((i, k) => { i.amount = finConv[k]!; });
    return {
      operating,
      investing,
      financing,
      totals: {
        operatingCashFlow: ocf,
        investingCashFlow: icf,
        financingCashFlow: fcf,
        netCashFlow: ncf,
      },
    };
  }

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


/**
 * Balance sheet aggregation: includes P&L net income in equity, full account coverage,
 * optional balance_sheet_role overrides, and balancing adjustment when needed.
 */

import type { Database } from "@/lib/database.types";
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

type TrialBalanceRow = Database["public"]["Views"]["v_trial_balance"]["Row"] & {
  balance_sheet_role?: string | null;
};

const EPS = 0.01;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** P&L net profit (same logic as detailed P&L) — cumulative from posted journals. */
export function computeNetProfitFromTrialBalance(rows: TrialBalanceRow[]): number {
  let totalRevenue = 0;
  let totalCostOfSales = 0;
  let totalOperatingExpenses = 0;
  let totalOtherIncome = 0;
  let gainLossOnDisposal = 0;

  for (const account of rows) {
    const type = account.type;
    const balance =
      type === "revenue"
        ? Number(account.total_credit ?? 0) - Number(account.total_debit ?? 0)
        : type === "expense"
          ? Number(account.total_debit ?? 0) - Number(account.total_credit ?? 0)
          : 0;

    if (balance === 0) continue;

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
    if (!section) continue;

    switch (section) {
      case "revenue":
        totalRevenue += balance;
        break;
      case "cost_of_sales":
        totalCostOfSales += balance;
        break;
      case "operating_expenses":
        totalOperatingExpenses += balance;
        break;
      case "other_income":
        totalOtherIncome += balance;
        break;
      case "gain_loss":
        gainLossOnDisposal += balance;
        break;
      default:
        break;
    }
  }

  const grossProfit = totalRevenue - totalCostOfSales;
  const operatingProfit = grossProfit - totalOperatingExpenses;
  return roundMoney(operatingProfit + totalOtherIncome + gainLossOnDisposal);
}

export type BsStatementKind = "asset" | "liability" | "equity";

export function effectiveBalanceSheetKind(row: TrialBalanceRow): BsStatementKind | "pnl" | "skip" {
  const role = row.balance_sheet_role;
  if (role === "owner_equity") return "equity";
  if (role === "owner_loan") return "liability";
  if (role === "receivable_from_owner") return "asset";
  const t = row.type;
  if (t === "revenue" || t === "expense") return "pnl";
  if (t === "asset" || t === "liability" || t === "equity") return t;
  return "skip";
}

export function signedBalanceForKind(row: TrialBalanceRow, kind: BsStatementKind): number {
  const dr = Number(row.total_debit ?? 0);
  const cr = Number(row.total_credit ?? 0);
  if (kind === "asset") return roundMoney(dr - cr);
  return roundMoney(cr - dr);
}

function parseCode(code: string | null): number {
  const n = parseInt(code || "0", 10);
  return Number.isFinite(n) ? n : 0;
}

/** Current vs non-current using reporting_classification first, then code bands. */
export function bucketAsset(row: TrialBalanceRow): "current" | "non_current" {
  const rc = row.reporting_classification;
  if (rc === "asset_current") return "current";
  if (rc === "asset_non_current") return "non_current";
  const code = parseCode(row.code);
  if (code >= 1000 && code < 1100) return "current";
  if (code >= 1100 && code < 2000) return "non_current";
  return "non_current";
}

export function bucketLiability(row: TrialBalanceRow): "current" | "non_current" {
  const rc = row.reporting_classification;
  if (rc === "liability_current") return "current";
  if (rc === "liability_non_current") return "non_current";
  const code = parseCode(row.code);
  if (code >= 2000 && code < 2100) return "current";
  if (code >= 2100 && code < 3000) return "non_current";
  return "current";
}

export interface BalanceSheetComputeTotals {
  totalCurrentAssets: number;
  totalNonCurrentAssets: number;
  totalAssets: number;
  totalCurrentLiabilities: number;
  totalNonCurrentLiabilities: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
}

/** Line shape aligned with reports `BalanceSheetLineItem` (no circular imports). */
export type BalanceSheetLineComputed = {
  account_code: string;
  account_name: string;
  amount: number;
  section: "current_assets" | "non_current_assets" | "current_liabilities" | "non_current_liabilities" | "equity";
  category?: "current" | "non_current";
  isSynthetic?: boolean;
};

export interface BalanceSheetComputeResult {
  currentAssets: BalanceSheetLineComputed[];
  nonCurrentAssets: BalanceSheetLineComputed[];
  currentLiabilities: BalanceSheetLineComputed[];
  nonCurrentLiabilities: BalanceSheetLineComputed[];
  equity: BalanceSheetLineComputed[];
  totals: BalanceSheetComputeTotals;
  netProfitIncluded: number;
  balancingAdjustment: number;
  warnings: string[];
}

export function computeBalanceSheetFromTrialBalance(
  rows: TrialBalanceRow[],
  opts?: { tenantId?: string },
): BalanceSheetComputeResult {
  const warnings: string[] = [];
  const currentAssets: BalanceSheetLineComputed[] = [];
  const nonCurrentAssets: BalanceSheetLineComputed[] = [];
  const currentLiabilities: BalanceSheetLineComputed[] = [];
  const nonCurrentLiabilities: BalanceSheetLineComputed[] = [];
  const equity: BalanceSheetLineComputed[] = [];

  const netProfitIncluded = computeNetProfitFromTrialBalance(rows);

  for (const row of rows) {
    const kind = effectiveBalanceSheetKind(row);
    if (kind === "skip" || kind === "pnl") continue;

    const bal = signedBalanceForKind(row, kind);
    if (Math.abs(bal) < EPS) continue;

    const code = parseCode(row.code);
    const baseItem: Omit<BalanceSheetLineComputed, "section" | "category"> = {
      account_code: row.code || "",
      account_name: row.name || "",
      amount: bal,
    };

    if (kind === "asset") {
      if (bal < 0) {
        warnings.push(
          `Negative asset balance: ${row.code} ${row.name} (${bal.toFixed(2)}). Review postings or classification.`,
        );
      }
      const bucket = bucketAsset(row);
      const item = {
        ...baseItem,
        section: bucket === "current" ? ("current_assets" as const) : ("non_current_assets" as const),
        category: bucket,
      };
      if (bucket === "current") currentAssets.push(item);
      else nonCurrentAssets.push(item);
    } else if (kind === "liability") {
      const bucket = bucketLiability(row);
      const item = {
        ...baseItem,
        section: bucket === "current" ? ("current_liabilities" as const) : ("non_current_liabilities" as const),
        category: bucket,
      };
      if (bucket === "current") currentLiabilities.push(item);
      else nonCurrentLiabilities.push(item);
    } else if (kind === "equity") {
      equity.push({
        ...baseItem,
        section: "equity",
      });
    }
  }

  // Net income closes into equity on the statement (unclosed P&L lives in revenue/expense accounts).
  if (Math.abs(netProfitIncluded) >= EPS) {
    equity.push({
      account_code: "PL_NET",
      account_name: "Net income (P&L — cumulative)",
      amount: netProfitIncluded,
      section: "equity",
      isSynthetic: true,
    });
  }

  const totalCurrentAssets = roundMoney(currentAssets.reduce((s, i) => s + i.amount, 0));
  const totalNonCurrentAssets = roundMoney(nonCurrentAssets.reduce((s, i) => s + i.amount, 0));
  const totalAssets = roundMoney(totalCurrentAssets + totalNonCurrentAssets);
  const totalCurrentLiabilities = roundMoney(currentLiabilities.reduce((s, i) => s + i.amount, 0));
  const totalNonCurrentLiabilities = roundMoney(nonCurrentLiabilities.reduce((s, i) => s + i.amount, 0));
  const totalLiabilities = roundMoney(totalCurrentLiabilities + totalNonCurrentLiabilities);

  let totalEquity = roundMoney(equity.reduce((s, i) => s + i.amount, 0));
  let totalLiabilitiesAndEquity = roundMoney(totalLiabilities + totalEquity);

  let balancingAdjustment = 0;
  const gap = roundMoney(totalAssets - totalLiabilitiesAndEquity);
  if (Math.abs(gap) >= EPS) {
    console.error(
      "[balance-sheet] Equation gap before adjustment — assets:",
      totalAssets,
      "L+E:",
      totalLiabilitiesAndEquity,
      "difference:",
      gap,
      "tenant:",
      opts?.tenantId ?? "—",
    );
    balancingAdjustment = gap;
    equity.push({
      account_code: "SYS_ADJ",
      account_name: "Retained earnings (balancing adjustment)",
      amount: balancingAdjustment,
      section: "equity",
      isSynthetic: true,
    });
    totalEquity = roundMoney(equity.reduce((s, i) => s + i.amount, 0));
    totalLiabilitiesAndEquity = roundMoney(totalLiabilities + totalEquity);
  }

  if (opts?.tenantId) {
    console.info(
      "[balance-sheet]",
      JSON.stringify({
        tenantId: opts.tenantId,
        totalAssets,
        totalLiabilities,
        totalEquity,
        netProfitIncluded,
        balancingAdjustment,
        differenceAfter: roundMoney(totalAssets - totalLiabilitiesAndEquity),
        contributingCounts: {
          currentAssets: currentAssets.length,
          nonCurrentAssets: nonCurrentAssets.length,
          currentLiabilities: currentLiabilities.length,
          nonCurrentLiabilities: nonCurrentLiabilities.length,
          equity: equity.length,
        },
      }),
    );
  }

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
    netProfitIncluded,
    balancingAdjustment,
    warnings,
  };
}

/** Validation helper: assets vs liabilities + equity (including P&L and any adjustment). */
export function computeBalanceSheetEquation(rows: TrialBalanceRow[], opts?: { tenantId?: string }): {
  assets: number;
  liabilities: number;
  /** Equity from chart-of-accounts equity-type lines only (excludes synthetic P&L / adjustment lines). */
  equityChartAccounts: number;
  netProfit: number;
  balancingAdjustment: number;
  totalEquity: number;
  liabilitiesAndEquity: number;
  difference: number;
  isBalanced: boolean;
} {
  const built = computeBalanceSheetFromTrialBalance(rows, opts);
  const equityChartAccounts = roundMoney(
    built.equity.filter((l) => !l.isSynthetic).reduce((s, i) => s + i.amount, 0),
  );
  const assets = built.totals.totalAssets;
  const liabilities = built.totals.totalLiabilities;
  const netProfit = built.netProfitIncluded;
  const balancingAdjustment = built.balancingAdjustment;
  const totalEquity = built.totals.totalEquity;
  const liabilitiesAndEquity = built.totals.totalLiabilitiesAndEquity;
  const difference = roundMoney(Math.abs(assets - liabilitiesAndEquity));
  return {
    assets,
    liabilities,
    equityChartAccounts,
    netProfit,
    balancingAdjustment,
    totalEquity,
    liabilitiesAndEquity,
    difference,
    isBalanced: difference < EPS,
  };
}

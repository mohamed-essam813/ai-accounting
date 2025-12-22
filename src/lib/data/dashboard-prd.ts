/**
 * PRD-Compliant Dashboard Data Functions
 * Based on PRD Section 5: Dashboard Philosophy
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import { getProfitAndLoss, getBalanceSheet, getCashFlow } from "./reports";
import { getRecentPrimaryInsights } from "./insights";
import type { Database } from "@/lib/database.types";

type TrialBalanceView = Database["public"]["Views"]["v_trial_balance"]["Row"];

export type AttentionSignalStatus = "stable" | "improving" | "worsening";

export interface AttentionSignal {
  id: string;
  title: string;
  status: AttentionSignalStatus;
  explanation: string;
  drillDownPath?: string;
}

export interface FinancialPulse {
  text: string;
  severity: "calm" | "attention" | "urgent";
}

export interface RecentFinancialEvent {
  id: string;
  description: string;
  date: string;
  insight?: string;
  type: "invoice" | "bill" | "payment" | "journal" | "other";
}

/**
 * Generate Financial Pulse narrative
 * PRD: "One short system-generated sentence"
 */
export async function getFinancialPulse(): Promise<FinancialPulse> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      text: "No financial activity detected.",
      severity: "calm",
    };
  }

  const [pnl, balanceSheet, cashFlow, receivables, payables, cashBalance] = await Promise.all([
    getProfitAndLoss(),
    getBalanceSheet(),
    getCashFlow(),
    getReceivablesBalance(),
    getPayablesBalance(),
    getCashBalance(),
  ]);

  const revenue = Number(pnl?.total_revenue ?? 0);
  const expenses = Number(pnl?.total_expense ?? 0);
  const netIncome = Number(pnl?.net_income ?? 0);
  const totalReceivables = receivables;
  const totalPayables = payables;

  const issues: string[] = [];
  let severity: FinancialPulse["severity"] = "calm";

  // Check for problems
  if (cashBalance < 0) {
    issues.push("cash balance is negative");
    severity = "urgent";
  } else if (cashBalance < 5000) {
    issues.push("cash balance is low");
    severity = severity === "calm" ? "attention" : severity;
  }

  if (totalReceivables > 50000) {
    issues.push("receivables are high");
    severity = severity === "calm" ? "attention" : severity;
  }

  if (totalPayables > 50000) {
    issues.push("payables are high");
    severity = severity === "calm" ? "attention" : severity;
  }

  if (expenses > 0 && revenue > 0) {
    const expenseRatio = (expenses / revenue) * 100;
    if (expenseRatio > 80) {
      issues.push("expenses are growing faster than revenue");
      severity = severity === "calm" ? "attention" : severity;
    }
  }

  if (netIncome < 0 && revenue > 0) {
    issues.push("operating at a loss");
    severity = severity === "calm" ? "attention" : severity;
  }

  // Build pulse text
  if (issues.length === 0) {
    return {
      text: "No unusual financial activity detected.",
      severity: "calm",
    };
  } else if (issues.length === 1) {
    return {
      text: issues[0].charAt(0).toUpperCase() + issues[0].slice(1) + ".",
      severity,
    };
  } else {
    const lastIssue = issues.pop();
    return {
      text: `${issues.join(", ")}, and ${lastIssue}.`,
      severity,
    };
  }
}

/**
 * Get Attention Signals (4-6 tiles)
 * PRD Section 5.4: Cash Flow, Receivables, Payables, Tax Exposure, Revenue Momentum, Expense Control
 */
export async function getAttentionSignals(): Promise<AttentionSignal[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const [cashFlow, receivables, payables, taxExposure, revenueMomentum, expenseControl] =
    await Promise.all([
      getCashFlowSignal(),
      getReceivablesSignal(),
      getPayablesSignal(),
      getTaxExposureSignal(),
      getRevenueMomentumSignal(),
      getExpenseControlSignal(),
    ]);

  const signals: AttentionSignal[] = [];

  if (cashFlow) signals.push(cashFlow);
  if (receivables) signals.push(receivables);
  if (payables) signals.push(payables);
  if (taxExposure) signals.push(taxExposure);
  if (revenueMomentum) signals.push(revenueMomentum);
  if (expenseControl) signals.push(expenseControl);

  return signals.slice(0, 6); // Max 6 signals
}

async function getCashFlowSignal(): Promise<AttentionSignal | null> {
  const cashBalance = await getCashBalance();
  const cashFlow = await getCashFlow();
  const netCashFlow = Number(cashFlow?.net_cash_flow ?? 0);

  let status: AttentionSignalStatus = "stable";
  let explanation = "";

  if (cashBalance < 0) {
    status = "worsening";
    explanation = `Cash balance is negative (${formatCurrency(cashBalance)}). Immediate action required.`;
  } else if (cashBalance < 5000) {
    status = "worsening";
    explanation = `Cash balance is low (${formatCurrency(cashBalance)}). Monitor closely.`;
  } else if (netCashFlow < 0) {
    status = "worsening";
    explanation = "Cash flow is negative this period.";
  } else if (netCashFlow > 0) {
    status = "improving";
    explanation = "Cash flow is positive this period.";
  } else {
    status = "stable";
    explanation = "Cash flow is stable.";
  }

  return {
    id: "cash_flow",
    title: "Cash Flow",
    status,
    explanation,
    drillDownPath: "/reports/pnl",
  };
}

async function getReceivablesSignal(): Promise<AttentionSignal | null> {
  const receivables = await getReceivablesBalance();
  const overdueCount = await getOverdueReceivablesCount();

  let status: AttentionSignalStatus = "stable";
  let explanation = "";

  if (receivables === 0) {
    return null; // Don't show if no receivables
  }

  if (overdueCount > 0) {
    status = "worsening";
    explanation = `${overdueCount} overdue ${overdueCount === 1 ? "invoice" : "invoices"}. Total receivables: ${formatCurrency(receivables)}.`;
  } else if (receivables > 50000) {
    status = "worsening";
    explanation = `Receivables are high (${formatCurrency(receivables)}). Consider following up on collections.`;
  } else {
    status = "stable";
    explanation = `Receivables are at ${formatCurrency(receivables)}.`;
  }

  return {
    id: "receivables",
    title: "Receivables",
    status,
    explanation,
    drillDownPath: "/contacts",
  };
}

async function getPayablesSignal(): Promise<AttentionSignal | null> {
  const payables = await getPayablesBalance();

  let status: AttentionSignalStatus = "stable";
  let explanation = "";

  if (payables === 0) {
    return null; // Don't show if no payables
  }

  if (payables > 50000) {
    status = "worsening";
    explanation = `Payables are high (${formatCurrency(payables)}). Plan payment schedule.`;
  } else {
    status = "stable";
    explanation = `Payables are at ${formatCurrency(payables)}.`;
  }

  return {
    id: "payables",
    title: "Payables",
    status,
    explanation,
    drillDownPath: "/contacts",
  };
}

async function getTaxExposureSignal(): Promise<AttentionSignal | null> {
  const supabase = await createServerSupabaseClient();
  const user = await getCurrentUser();
  if (!user?.tenant) return null;

  // Get VAT report
  const vatView = supabase.from("v_vat_report") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { vat_payable: number | null } | null;
          error: unknown;
        }>;
      };
    };
  };

  const { data: vat } = await vatView.select("*").eq("tenant_id", user.tenant.id).maybeSingle();

  const vatPayable = vat?.vat_payable ? Number(vat.vat_payable) : 0;

  if (vatPayable === 0) {
    return null;
  }

  let status: AttentionSignalStatus = "stable";
  let explanation = "";

  if (vatPayable > 10000) {
    status = "worsening";
    explanation = `Tax liability is ${formatCurrency(vatPayable)}. Ensure funds are set aside.`;
  } else {
    status = "stable";
    explanation = `Tax liability is ${formatCurrency(vatPayable)}.`;
  }

  return {
    id: "tax_exposure",
    title: "Tax Exposure",
    status,
    explanation,
    drillDownPath: "/reports/pnl",
  };
}

async function getRevenueMomentumSignal(): Promise<AttentionSignal | null> {
  const pnl = await getProfitAndLoss();
  const revenue = Number(pnl?.total_revenue ?? 0);

  if (revenue === 0) {
    return null;
  }

  // Simplified: In production, compare with previous period
  return {
    id: "revenue_momentum",
    title: "Revenue Momentum",
    status: "stable",
    explanation: `Year-to-date revenue: ${formatCurrency(revenue)}.`,
    drillDownPath: "/reports/pnl",
  };
}

async function getExpenseControlSignal(): Promise<AttentionSignal | null> {
  const pnl = await getProfitAndLoss();
  const revenue = Number(pnl?.total_revenue ?? 0);
  const expenses = Number(pnl?.total_expense ?? 0);

  if (expenses === 0) {
    return null;
  }

  let status: AttentionSignalStatus = "stable";
  let explanation = "";

  if (revenue > 0) {
    const expenseRatio = (expenses / revenue) * 100;
    if (expenseRatio > 80) {
      status = "worsening";
      explanation = `Expenses are ${expenseRatio.toFixed(0)}% of revenue. Consider cost optimization.`;
    } else {
      status = "stable";
      explanation = `Expenses are ${expenseRatio.toFixed(0)}% of revenue.`;
    }
  } else {
    status = "worsening";
    explanation = `Expenses at ${formatCurrency(expenses)} with no revenue.`;
  }

  return {
    id: "expense_control",
    title: "Expense Control",
    status,
    explanation,
    drillDownPath: "/reports/pnl",
  };
}

/**
 * Get Recent Financial Events (meaningful events, not raw transactions)
 */
export async function getRecentFinancialEvents(limit: number = 5): Promise<RecentFinancialEvent[]> {
  const insights = await getRecentPrimaryInsights(limit * 2); // Get more to filter

  const events: RecentFinancialEvent[] = [];

  for (const insight of insights.slice(0, limit)) {
    // Extract event type from insight context or description
    let type: RecentFinancialEvent["type"] = "other";
    if (insight.context_json) {
      const intent = (insight.context_json as { intent?: string }).intent;
      if (intent === "create_invoice") type = "invoice";
      else if (intent === "create_bill") type = "bill";
      else if (intent === "record_payment") type = "payment";
      else if (intent) type = "journal";
    }

    events.push({
      id: insight.id || "",
      description: insight.insight_text,
      date: insight.created_at || new Date().toISOString(),
      insight: insight.insight_text,
      type,
    });
  }

  return events;
}

// Helper functions
async function getCashBalance(): Promise<number> {
  const user = await getCurrentUser();
  if (!user?.tenant) return 0;

  const supabase = await createServerSupabaseClient();
  const trialBalanceView = supabase.from("v_trial_balance") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: TrialBalanceView | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const { data: cashAccount } = await trialBalanceView
    .select("total_debit, total_credit")
    .eq("tenant_id", user.tenant.id)
    .eq("code", "1000")
    .maybeSingle();

  if (!cashAccount || !cashAccount.total_debit || !cashAccount.total_credit) return 0;

  return Number(cashAccount.total_debit) - Number(cashAccount.total_credit);
}

async function getReceivablesBalance(): Promise<number> {
  const user = await getCurrentUser();
  if (!user?.tenant) return 0;

  const supabase = await createServerSupabaseClient();
  const trialBalanceView = supabase.from("v_trial_balance") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: TrialBalanceView | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const { data: receivablesAccount } = await trialBalanceView
    .select("total_debit, total_credit")
    .eq("tenant_id", user.tenant.id)
    .eq("code", "1100")
    .maybeSingle();

  if (!receivablesAccount || !receivablesAccount.total_debit || !receivablesAccount.total_credit)
    return 0;

  return Number(receivablesAccount.total_debit) - Number(receivablesAccount.total_credit);
}

async function getPayablesBalance(): Promise<number> {
  const user = await getCurrentUser();
  if (!user?.tenant) return 0;

  const supabase = await createServerSupabaseClient();
  const trialBalanceView = supabase.from("v_trial_balance") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: TrialBalanceView | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const { data: payablesAccount } = await trialBalanceView
    .select("total_debit, total_credit")
    .eq("tenant_id", user.tenant.id)
    .eq("code", "2000")
    .maybeSingle();

  if (!payablesAccount || !payablesAccount.total_credit || !payablesAccount.total_debit) return 0;

  return Number(payablesAccount.total_credit) - Number(payablesAccount.total_debit);
}

async function getOverdueReceivablesCount(): Promise<number> {
  // Simplified: In production, query invoices with due_date < today and status = unpaid
  // For now, return 0
  return 0;
}

function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}


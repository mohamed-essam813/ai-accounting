/**
 * PRD-Compliant Dashboard Data Functions
 * Based on PRD Section 5: Dashboard Philosophy
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import { getProfitAndLoss, getBalanceSheet, getCashFlow } from "./reports";
import { getRecentPrimaryInsights } from "./insights";
import { getARAgeingSummary, getAPAgeingSummary } from "./ageing";
import {
  getPeriodFinancialData,
  type PeriodFinancialData,
} from "./period-comparison";
import {
  getCurrentMonth,
  getPreviousMonth,
  calculateComparison,
  formatComparison,
} from "@/lib/utils/period-comparison";
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
 * Helper function to convert amount if targetCurrency is provided
 */
async function convertAmountIfNeeded(
  amount: number,
  targetCurrency: string | undefined,
  tenantId: string,
  date: string,
): Promise<number> {
  if (!targetCurrency) return amount;
  
  const { convertCurrency, getTenantBaseCurrency } = await import("@/lib/utils/currency-conversion");
  const baseCurrency = await getTenantBaseCurrency(tenantId);
  
  if (baseCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
    return amount;
  }
  
  return await convertCurrency(amount, baseCurrency, targetCurrency, date, tenantId);
}

/**
 * Generate Financial Pulse narrative
 * PRD: "One short system-generated sentence"
 */
export async function getFinancialPulse(targetCurrency?: string): Promise<FinancialPulse> {
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

  let revenue = Number(pnl?.total_revenue ?? 0);
  let expenses = Number(pnl?.total_expense ?? 0);
  let netIncome = Number(pnl?.net_income ?? 0);
  let totalReceivables = receivables;
  let totalPayables = payables;
  
  // Convert amounts if targetCurrency is provided
  if (targetCurrency && user.tenant) {
    const today = new Date().toISOString().split("T")[0];
    revenue = await convertAmountIfNeeded(revenue, targetCurrency, user.tenant.id, today);
    expenses = await convertAmountIfNeeded(expenses, targetCurrency, user.tenant.id, today);
    netIncome = await convertAmountIfNeeded(netIncome, targetCurrency, user.tenant.id, today);
    totalReceivables = await convertAmountIfNeeded(totalReceivables, targetCurrency, user.tenant.id, today);
    totalPayables = await convertAmountIfNeeded(totalPayables, targetCurrency, user.tenant.id, today);
  }

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
export async function getAttentionSignals(targetCurrency?: string): Promise<AttentionSignal[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const [cashFlow, receivablesHealth, payablesPressure, taxExposure, revenueMomentum, expenseControl] =
    await Promise.all([
      getCashFlowSignal(targetCurrency),
      getReceivablesHealthSignal(targetCurrency),
      getPayablesPressureSignal(targetCurrency),
      getTaxExposureSignal(targetCurrency),
      getRevenueMomentumSignal(targetCurrency),
      getExpenseControlSignal(targetCurrency),
    ]);

  const signals: AttentionSignal[] = [];

  if (cashFlow) signals.push(cashFlow);
  if (receivablesHealth) signals.push(receivablesHealth);
  if (payablesPressure) signals.push(payablesPressure);
  if (taxExposure) signals.push(taxExposure);
  if (revenueMomentum) signals.push(revenueMomentum);
  if (expenseControl) signals.push(expenseControl);

  // Sort by urgency: worsening first, then improving, then stable
  signals.sort((a, b) => {
    const order = { worsening: 0, improving: 1, stable: 2 };
    return order[a.status] - order[b.status];
  });

  return signals.slice(0, 6); // Max 6 signals
}

async function getCashFlowSignal(targetCurrency?: string): Promise<AttentionSignal | null> {
  const user = await getCurrentUser();
  const [cashBalance, cashFlow, receivables, payables] = await Promise.all([
    getCashBalance(),
    getCashFlow(),
    getReceivablesBalance(),
    getPayablesBalance(),
  ]);
  
  let netCashFlow = Number(cashFlow?.net_cash_flow ?? 0);
  let cashBalanceForLogic = cashBalance;
  let receivablesForLogic = receivables;
  let payablesForLogic = payables;
  
  // Convert amounts if needed
  if (targetCurrency && user?.tenant) {
    const today = new Date().toISOString().split("T")[0];
    cashBalanceForLogic = await convertAmountIfNeeded(cashBalance, targetCurrency, user.tenant.id, today);
    receivablesForLogic = await convertAmountIfNeeded(receivables, targetCurrency, user.tenant.id, today);
    payablesForLogic = await convertAmountIfNeeded(payables, targetCurrency, user.tenant.id, today);
    netCashFlow = await convertAmountIfNeeded(netCashFlow, targetCurrency, user.tenant.id, today);
  }

  let status: AttentionSignalStatus = "stable";
  let explanation = "";

  // Cash signals must always reference cause, not balance alone (Feedback Section 3.1)
  if (cashBalanceForLogic < 0) {
    status = "worsening";
    // Explain why cash is negative (cause) and impact
    if (receivablesForLogic > Math.abs(cashBalanceForLogic) * 0.5) {
      explanation = "Cash balance is negative because a high portion of revenue is still unpaid. Collection timing is currently affecting liquidity.";
    } else if (payablesForLogic > Math.abs(cashBalanceForLogic)) {
      explanation = "Cash balance is negative due to upcoming supplier payments exceeding available funds. Immediate action required.";
    } else {
      explanation = "Cash balance is negative. Expenses or payments have exceeded available funds. Immediate action required.";
    }
  } else if (cashBalanceForLogic < 5000) {
    status = "worsening";
    // Explain why cash is low (cause) and impact
    if (receivablesForLogic > cashBalanceForLogic * 2) {
      explanation = "Cash is low because a high portion of revenue is still unpaid. Collection timing is currently affecting liquidity.";
    } else if (payablesForLogic > cashBalanceForLogic) {
      explanation = "Cash is low relative to upcoming supplier payments. Plan payment schedule carefully.";
    } else {
      explanation = "Cash balance is low. Monitor closely and ensure collections are on track.";
    }
  } else if (netCashFlow < 0) {
    status = "worsening";
    // Explain cause of negative cash flow
    if (receivables > payables) {
      explanation = "Cash flow is negative this period because collections are slower than expected, despite receivables being higher than payables.";
    } else {
      explanation = "Cash flow is negative this period. Outflows are exceeding inflows.";
    }
  } else if (netCashFlow > 0) {
    status = "improving";
    explanation = "Cash flow is positive this period. Collections and inflows are healthy.";
  } else {
    status = "stable";
    explanation = "Cash flow is stable with no significant changes this period.";
  }

  return {
    id: "cash_flow",
    title: "Cash Flow",
    status,
    explanation,
    drillDownPath: "/insights/cash",
  };
}

/**
 * Receivables Health Signal (Feedback Section 4.1)
 * Must be ageing-based, not total-based
 */
async function getReceivablesHealthSignal(targetCurrency?: string): Promise<AttentionSignal | null> {
  const ageingSummary = await getARAgeingSummary();
  
  if (ageingSummary.length === 0) {
    return null; // Don't show if no receivables
  }

  // Calculate ageing totals
  const totalOutstanding = ageingSummary.reduce((sum, item) => sum + item.total_outstanding, 0);
  const totalCurrent = ageingSummary.reduce((sum, item) => sum + item.total_current, 0);
  const total31_60 = ageingSummary.reduce((sum, item) => sum + item.total_31_60, 0);
  const total61_90 = ageingSummary.reduce((sum, item) => sum + item.total_61_90, 0);
  const total90Plus = ageingSummary.reduce((sum, item) => sum + item.total_90_plus, 0);
  
  const overdueTotal = total31_60 + total61_90 + total90Plus;
  const overduePercentage = totalOutstanding > 0 ? (overdueTotal / totalOutstanding) * 100 : 0;

  let status: AttentionSignalStatus = "stable";
  let explanation = "";

  // Ageing-based signals (Feedback Section 4.1)
  if (overdueTotal === 0 && totalOutstanding > 0) {
    status = "stable";
    explanation = "Most receivables are still within normal payment terms.";
  } else if (overduePercentage < 10) {
    status = "stable";
    explanation = "Most receivables are current. A small portion is overdue, with minimal impact on cash availability.";
  } else if (overduePercentage < 30) {
    status = "worsening";
    explanation = "A growing portion of receivables is overdue, slowing cash. Collection timing is affecting liquidity.";
  } else {
    status = "worsening";
    explanation = "A significant portion of receivables is overdue. This delay is significantly slowing cash availability and increasing collection risk.";
  }

  return {
    id: "receivables_health",
    title: "Receivables Health",
    status,
    explanation,
    drillDownPath: "/insights/receivables",
  };
}

/**
 * Payables Pressure Signal (Feedback Section 4.2)
 * Must show upcoming payment context, not just totals
 */
async function getPayablesPressureSignal(targetCurrency?: string): Promise<AttentionSignal | null> {
  const user = await getCurrentUser();
  const [ageingSummary, cashBalance] = await Promise.all([
    getAPAgeingSummary(),
    getCashBalance(),
  ]);
  
  let cashBalanceForLogic = cashBalance;
  
  // Convert if needed
  if (targetCurrency && user?.tenant) {
    const today = new Date().toISOString().split("T")[0];
    cashBalanceForLogic = await convertAmountIfNeeded(cashBalance, targetCurrency, user.tenant.id, today);
  }

  if (ageingSummary.length === 0) {
    return null; // Don't show if no payables
  }

  // Calculate ageing totals
  const totalOutstanding = ageingSummary.reduce((sum, item) => sum + item.total_outstanding, 0);
  const totalCurrent = ageingSummary.reduce((sum, item) => sum + item.total_current, 0);
  const total31_60 = ageingSummary.reduce((sum, item) => sum + item.total_31_60, 0);
  const total61_90 = ageingSummary.reduce((sum, item) => sum + item.total_61_90, 0);
  const total90Plus = ageingSummary.reduce((sum, item) => sum + item.total_90_plus, 0);
  
  // Near-term payables (due in next 30 days)
  const nearTermPayables = totalCurrent + total31_60;
  const cashComfortThreshold = cashBalanceForLogic * 0.3; // 30% of cash as comfort buffer

  let status: AttentionSignalStatus = "stable";
  let explanation = "";

  // Upcoming payment context (Feedback Section 4.2)
  if (nearTermPayables === 0 && totalOutstanding > 0) {
    status = "stable";
    explanation = "No major supplier payments are due in the next 14 days.";
  } else if (nearTermPayables > 0 && nearTermPayables < cashComfortThreshold) {
    status = "stable";
    explanation = "Upcoming payables are manageable relative to available cash.";
  } else if (nearTermPayables > cashBalanceForLogic) {
    status = "worsening";
    explanation = "Upcoming payables may pressure cash if collections do not improve. Plan payment schedule carefully.";
  } else if (nearTermPayables > cashComfortThreshold) {
    status = "worsening";
    explanation = "Upcoming supplier payments are significant relative to cash. Monitor collections closely.";
  } else {
    status = "stable";
    explanation = "Upcoming payables are within normal payment terms.";
  }

  return {
    id: "payables_pressure",
    title: "Payables Pressure",
    status,
    explanation,
    drillDownPath: "/insights/payables",
  };
}

async function getTaxExposureSignal(targetCurrency?: string): Promise<AttentionSignal | null> {
  const [supabase, user, cashBalance] = await Promise.all([
    createServerSupabaseClient(),
    getCurrentUser(),
    getCashBalance(),
  ]);
  
  let cashBalanceForLogic = cashBalance;
  let vatPayable = 0;
  
  // Convert if needed
  if (targetCurrency && user?.tenant) {
    const today = new Date().toISOString().split("T")[0];
    cashBalanceForLogic = await convertAmountIfNeeded(cashBalance, targetCurrency, user.tenant.id, today);
  }
  
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

  vatPayable = vat?.vat_payable ? Number(vat.vat_payable) : 0;
  
  // Convert VAT payable if needed
  if (targetCurrency && user?.tenant && vatPayable > 0) {
    const today = new Date().toISOString().split("T")[0];
    vatPayable = await convertAmountIfNeeded(vatPayable, targetCurrency, user.tenant.id, today);
  }

  if (vatPayable === 0) {
    return null;
  }

  let status: AttentionSignalStatus = "stable";
  let explanation = "";

  // Add cash context (Feedback Section 3.4)
  if (vatPayable > 10000) {
    status = "worsening";
    if (vatPayable > cashBalanceForLogic) {
      explanation = `Tax liability is ${formatCurrency(vatPayable, targetCurrency || "USD")} and exceeds available cash. Ensure funds are set aside before the due date.`;
    } else if (vatPayable > cashBalanceForLogic * 0.5) {
      explanation = `Tax liability is ${formatCurrency(vatPayable, targetCurrency || "USD")} and represents a significant portion of available cash. Plan accordingly.`;
    } else {
      explanation = `Tax liability is ${formatCurrency(vatPayable, targetCurrency || "USD")}. Ensure funds are set aside, but it does not significantly affect short-term cash.`;
    }
  } else {
    status = "stable";
    explanation = `Tax liability is low (${formatCurrency(vatPayable, targetCurrency || "USD")}) and does not affect short-term cash.`;
  }

  return {
    id: "tax_exposure",
    title: "Tax Exposure",
    status,
    explanation,
    // No drill-down path - tax insight detail view doesn't exist yet (Feedback Section 5)
  };
}

/**
 * Revenue Momentum Signal (Feedback Section 3.2)
 * Must be relative/comparative, not absolute totals
 * Excel Elimination Doctrine: Native Comparisons
 */
async function getRevenueMomentumSignal(targetCurrency?: string): Promise<AttentionSignal | null> {
  // Get current and previous month data for comparison
  const currentMonth = getCurrentMonth();
  const previousMonth = getPreviousMonth();

  const [currentData, previousData, receivables] = await Promise.all([
    getPeriodFinancialData(currentMonth, targetCurrency),
    getPeriodFinancialData(previousMonth, targetCurrency),
    getReceivablesBalance(),
  ]);
  
  // Convert receivables if needed
  let receivablesForLogic = receivables;
  if (targetCurrency) {
    const user = await getCurrentUser();
    if (user?.tenant) {
      const today = new Date().toISOString().split("T")[0];
      receivablesForLogic = await convertAmountIfNeeded(receivables, targetCurrency, user.tenant.id, today);
    }
  }

  const currentRevenue = currentData.revenue;
  const previousRevenue = previousData.revenue;

  if (currentRevenue === 0 && previousRevenue === 0) {
    return null;
  }

  // Calculate period comparison (Excel Elimination Doctrine)
  const comparison = calculateComparison(currentRevenue, previousRevenue);
  const { text: comparisonText } = formatComparison(comparison);

  let status: AttentionSignalStatus = "stable";
  let explanation = "";

  // Determine status based on comparison direction
  if (comparison.direction === "up") {
    status = "improving";
    explanation = `Revenue for this period is ${Math.abs(comparison.percentageChange).toFixed(1)}% higher than the previous period. ${comparisonText}`;
  } else if (comparison.direction === "down") {
    status = "worsening";
    explanation = `Revenue for this period is ${Math.abs(comparison.percentageChange).toFixed(1)}% lower than the previous period. ${comparisonText}`;
  } else {
    // Stable revenue, but check collection timing
    if (receivablesForLogic > 0) {
      const collectionRatio = receivablesForLogic / currentRevenue;
      if (collectionRatio > 0.5) {
        status = "worsening";
        explanation = `Revenue is stable compared to last month, but collections are slower. A high portion of revenue (${(collectionRatio * 100).toFixed(0)}%) is still unpaid.`;
      } else if (collectionRatio > 0.3) {
        status = "stable";
        explanation = "Revenue is stable, but collections could be faster. Some receivables are still outstanding.";
      } else {
        status = "improving";
        explanation = "Revenue is stable and collections are on track. Most receivables are being paid on time.";
      }
    } else {
      status = "improving";
      explanation = "Revenue is stable and all collections are current. Cash flow from operations is healthy.";
    }
  }

  return {
    id: "revenue_momentum",
    title: "Revenue Momentum",
    status,
    explanation,
    drillDownPath: "/insights/receivables", // Changed to insight detail view (Feedback Section 5)
  };
}

/**
 * Expense Control Signal (Feedback Section 3.3)
 * Must NOT calculate ratios when revenue is near zero
 */
async function getExpenseControlSignal(targetCurrency?: string): Promise<AttentionSignal | null> {
  const user = await getCurrentUser();
  const pnl = await getProfitAndLoss();
  let revenue = Number(pnl?.total_revenue ?? 0);
  let expenses = Number(pnl?.total_expense ?? 0);
  
  // Convert if needed
  if (targetCurrency && user?.tenant) {
    const today = new Date().toISOString().split("T")[0];
    revenue = await convertAmountIfNeeded(revenue, targetCurrency, user.tenant.id, today);
    expenses = await convertAmountIfNeeded(expenses, targetCurrency, user.tenant.id, today);
  }

  if (expenses === 0) {
    return null;
  }

  let status: AttentionSignalStatus = "stable";
  let explanation = "";

  // Critical: Do not calculate ratios when revenue is near zero (Feedback Section 3.3)
  // Use a threshold to determine "near zero" (e.g., less than 10% of expenses)
  const revenueThreshold = expenses * 0.1;

  if (revenue > revenueThreshold) {
    // Revenue is meaningful, can calculate ratio
    const expenseRatio = (expenses / revenue) * 100;
    if (expenseRatio > 80) {
      status = "worsening";
      explanation = "Fixed costs are growing faster than revenue this period. Consider cost optimization.";
    } else if (expenseRatio > 60) {
      status = "stable";
      explanation = "Expenses are in line with revenue. Monitor cost trends to maintain profitability.";
    } else {
      status = "improving";
      explanation = "Expenses are well-controlled relative to revenue. Cost management is effective.";
    }
  } else {
    // Revenue is near zero or negative - show narrative, not ratio (Feedback Section 3.3)
    if (revenue < 0) {
      status = "worsening";
      explanation = "Expenses currently exceed revenue due to timing differences. This is common in early-stage periods or when revenue recognition lags expenses.";
    } else {
      status = "worsening";
      explanation = "Expenses currently exceed revenue due to timing differences. This is common in early-stage periods.";
    }
  }

  return {
    id: "expense_control",
    title: "Expense Control",
    status,
    explanation,
    drillDownPath: "/insights/payables", // Changed to insight detail view (Feedback Section 5)
  };
}

/**
 * Get Recent Financial Events — prefer Financial Timeline (PRD), fallback to insight snippets.
 */
export async function getRecentFinancialEvents(
  limit: number = 5,
  _targetCurrency?: string,
): Promise<RecentFinancialEvent[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data: timelineRows, error } = await supabase
    .from("timeline_events")
    .select("id, description, event_date, event_type, created_at")
    .eq("tenant_id", user.tenant.id)
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!error && timelineRows && timelineRows.length > 0) {
    return timelineRows.map((ev) => {
      let type: RecentFinancialEvent["type"] = "other";
      const et = ev.event_type || "";
      if (et === "invoice_posted" || et.includes("invoice")) type = "invoice";
      else if (et === "bill_posted" || et.startsWith("bill")) type = "bill";
      else if (et.includes("payment")) type = "payment";
      else if (et.includes("journal")) type = "journal";

      return {
        id: ev.id,
        description: ev.description,
        date: `${ev.event_date}T12:00:00.000Z`,
        insight: undefined,
        type,
      };
    });
  }

  const insights = await getRecentPrimaryInsights(limit * 2);
  const events: RecentFinancialEvent[] = [];

  for (const insight of insights.slice(0, limit)) {
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


function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}


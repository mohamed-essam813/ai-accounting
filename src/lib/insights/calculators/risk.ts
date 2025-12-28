/**
 * Risk Insight Calculator - Ageing-Based (Engineering Guide Section 3.2 & 3.3)
 * 
 * AR insights MUST be based on ageing buckets, not totals
 * AP insights MUST focus on due vs overdue amounts
 * 
 * Answers: "What risks does this transaction create or mitigate?"
 */

import type { Insight, InsightContext } from "../types";
import { formatInsightText } from "../generate";
import { getARAgeingSummary, getAPAgeingSummary } from "@/lib/data/ageing";

export async function generateRiskInsight(
  context: InsightContext,
): Promise<Insight | null> {
  const { intent, amount, currency, counterparty, financial_delta, previous_state } = context;

  // Engineering Guide Section 3.1: Only generate if meaningful change detected
  if (!shouldGenerateRiskInsight(context)) {
    return null;
  }

  // Receivables Insight Logic (Engineering Guide Section 3.2)
  if (intent === "create_invoice" && financial_delta?.receivable_change) {
    return await generateReceivablesInsight(context);
  }

  // Payables Insight Logic (Engineering Guide Section 3.3)
  if (intent === "create_bill" && financial_delta?.payable_change) {
    return await generatePayablesInsight(context);
  }

  // Tax exposure risk
  if (financial_delta?.tax_change && financial_delta.tax_change > 0) {
    const taxAmount = financial_delta.tax_change;
    return {
      category: "risk",
      level: "secondary",
      insight_text: formatInsightText(
        `This transaction increased your tax liability by ${formatCurrency(taxAmount, currency)}. Ensure you have funds set aside for tax payments.`
      ),
      insight_type: "tax_exposure",
      what_changed: `Tax liability increased by ${formatCurrency(taxAmount, currency)}`,
      why_it_changed: "Transaction included taxable amount",
      business_impact: "Requires cash set aside for tax payment",
      confidence_level: "high",
      drill_down_targets: ["/reports"],
      context_json: {
        intent,
        amount,
        currency,
        risk_type: "tax",
        tax_amount: taxAmount,
      },
    };
  }

  // Cash flow risk (low cash balance)
  if (previous_state?.cash_balance !== undefined && financial_delta?.cash_change) {
    const newCashBalance = previous_state.cash_balance + financial_delta.cash_change;
    if (newCashBalance < 0) {
      return {
        category: "risk",
        level: "primary",
        insight_text: formatInsightText(
          `Warning: Your cash balance is now negative (${formatCurrency(newCashBalance, currency)}). Immediate action required to avoid cash flow problems.`
        ),
        insight_type: "cash_flow_critical",
        what_changed: "Cash balance became negative",
        why_it_changed: "Cash outflow exceeded available balance",
        business_impact: "Immediate cash flow risk - may impact operations",
        confidence_level: "high",
        drill_down_targets: ["/reports", "/bank"],
        context_json: {
          intent,
          amount,
          currency,
          risk_type: "cash_flow",
          cash_balance: newCashBalance,
        },
      };
    } else if (newCashBalance < 5000) {
      return {
        category: "risk",
        level: "primary",
        insight_text: formatInsightText(
          `Your cash balance is low (${formatCurrency(newCashBalance, currency)}). Monitor closely and consider collecting receivables or reducing expenses.`
        ),
        insight_type: "cash_flow_low",
        what_changed: "Cash balance dropped below comfortable threshold",
        why_it_changed: "Cash outflow or low cash reserves",
        business_impact: "Limited cash flexibility - may need to collect receivables",
        confidence_level: "high",
        drill_down_targets: ["/reports", "/contacts"],
        context_json: {
          intent,
          amount,
          currency,
          risk_type: "cash_flow",
          cash_balance: newCashBalance,
        },
      };
    }
  }

  return null;
}

/**
 * Engineering Guide Section 3.1: Trigger Conditions
 * Generate insight only if meaningful change detected
 */
function shouldGenerateRiskInsight(context: InsightContext): boolean {
  const { intent, financial_delta, previous_state } = context;

  // For receivables/payables, check if ageing changed
  if (intent === "create_invoice" || intent === "create_bill") {
    // We'll check ageing movement in the specific insight generators
    return true; // Always check for AR/AP insights
  }

  // For other intents, check if risk threshold crossed
  if (financial_delta?.tax_change && financial_delta.tax_change > 0) {
    return true;
  }

  if (previous_state?.cash_balance !== undefined && financial_delta?.cash_change) {
    const newCashBalance = previous_state.cash_balance + financial_delta.cash_change;
    if (newCashBalance < 0 || newCashBalance < 5000) {
      return true; // Risk threshold crossed
    }
  }

  return false;
}

/**
 * Receivables Insight (Engineering Guide Section 3.2)
 * MUST be based on ageing buckets, not totals
 */
async function generateReceivablesInsight(
  context: InsightContext,
): Promise<Insight | null> {
  const { amount, currency, counterparty, financial_delta, previous_state } = context;

  // Get current AR ageing
  const currentAgeing = await getARAgeingSummary();
  const currentTotal = currentAgeing.reduce((sum, item) => sum + item.total_outstanding, 0);

  // Get previous ageing state
  const previousAgeing = previous_state?.ar_ageing;
  if (!previousAgeing) {
    // First invoice - generate basic insight
    return {
      category: "risk",
      level: "primary",
      insight_text: formatInsightText(
        `You are now waiting to collect ${formatCurrency(amount, currency)} from ${counterparty || "this customer"}. This increases your receivables but has not yet changed your cash.`
      ),
      insight_type: "receivables_new",
      what_changed: `New receivable of ${formatCurrency(amount, currency)} created`,
      why_it_changed: "Invoice issued to customer",
      business_impact: "Profit increased, cash has not yet changed",
      confidence_level: "high",
      drill_down_targets: ["/contacts", "/reports"],
      context_json: {
        intent: "create_invoice",
        amount,
        currency,
        counterparty,
        receivable_amount: amount,
      },
    };
  }

  // Calculate current ageing totals
  const currentAgeingTotal = currentAgeing.reduce(
    (acc, item) => ({
      current_0_30: acc.current_0_30 + item.total_current,
      days_31_60: acc.days_31_60 + item.total_31_60,
      days_61_90: acc.days_61_90 + item.total_61_90,
      days_90_plus: acc.days_90_plus + item.total_90_plus,
    }),
    { current_0_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0 },
  );

  // Check for ageing bucket movement (Engineering Guide Section 3.1)
  const overdueIncrease =
    currentAgeingTotal.days_31_60 +
    currentAgeingTotal.days_61_90 +
    currentAgeingTotal.days_90_plus -
    (previousAgeing.days_31_60 + previousAgeing.days_61_90 + previousAgeing.days_90_plus);

  const overduePercentage = previousAgeing.total_outstanding > 0
    ? ((previousAgeing.days_31_60 + previousAgeing.days_61_90 + previousAgeing.days_90_plus) /
        previousAgeing.total_outstanding) *
      100
    : 0;

  const newOverduePercentage = currentAgeingTotal.current_0_30 + currentAgeingTotal.days_31_60 + 
    currentAgeingTotal.days_61_90 + currentAgeingTotal.days_90_plus > 0
    ? ((currentAgeingTotal.days_31_60 + currentAgeingTotal.days_61_90 + currentAgeingTotal.days_90_plus) /
        (currentAgeingTotal.current_0_30 + currentAgeingTotal.days_31_60 + 
         currentAgeingTotal.days_61_90 + currentAgeingTotal.days_90_plus)) *
      100
    : 0;

  // Generate insight based on ageing changes (Engineering Guide Section 3.2)
  if (overdueIncrease > 0 || newOverduePercentage > overduePercentage + 5) {
    const overdueAmount =
      currentAgeingTotal.days_31_60 + currentAgeingTotal.days_61_90 + currentAgeingTotal.days_90_plus;

    let insightText = "";
    let level: "primary" | "secondary" = "secondary";

    if (currentAgeingTotal.days_90_plus > previousAgeing.days_90_plus) {
      const amount90Plus = currentAgeingTotal.days_90_plus;
      insightText = `${formatCurrency(amount90Plus, currency)} of your receivables are over 90 days overdue. `;
      insightText += "This delay is significantly slowing cash availability and increasing collection risk.";
      level = "primary";
    } else if (overdueIncrease > 0) {
      insightText = `Your overdue receivables increased by ${formatCurrency(overdueIncrease, currency)}. `;
      insightText += `This delay is now slowing cash availability.`;
      level = overdueIncrease > amount * 0.5 ? "primary" : "secondary";
    }

    // Add customer concentration check
    const topCustomer = currentAgeing
      .sort((a, b) => b.total_outstanding - a.total_outstanding)[0];
    if (topCustomer && topCustomer.total_outstanding > currentTotal * 0.4) {
      insightText += ` ${topCustomer.customer_name} represents ${Math.round(
        (topCustomer.total_outstanding / currentTotal) * 100,
      )}% of your receivables, increasing concentration risk.`;
    }

    return {
      category: "risk",
      level,
      insight_text: formatInsightText(insightText),
      insight_type: "receivables_ageing",
      what_changed: `Overdue receivables increased by ${formatCurrency(overdueIncrease, currency)}`,
      why_it_changed: "Customer payments are slowing compared to previous period",
      business_impact: "Cash availability is being delayed, increasing working capital needs",
      confidence_level: "high",
      drill_down_targets: ["/contacts", "/reports"],
      context_json: {
        intent: "create_invoice",
        amount,
        currency,
        counterparty,
        overdue_amount: overdueAmount,
        overdue_increase: overdueIncrease,
        ageing_breakdown: {
          current_0_30: currentAgeingTotal.current_0_30,
          days_31_60: currentAgeingTotal.days_31_60,
          days_61_90: currentAgeingTotal.days_61_90,
          days_90_plus: currentAgeingTotal.days_90_plus,
        },
      },
    };
  }

  // If no meaningful ageing change, don't generate insight (Engineering Guide: silence is valid)
  return null;
}

/**
 * Payables Insight (Engineering Guide Section 3.3)
 * MUST focus on due vs overdue, cash pressure, timing flexibility
 */
async function generatePayablesInsight(
  context: InsightContext,
): Promise<Insight | null> {
  const { amount, currency, counterparty, financial_delta, previous_state } = context;

  // Get current AP ageing
  const currentAgeing = await getAPAgeingSummary();
  const currentTotal = currentAgeing.reduce((sum, item) => sum + item.total_outstanding, 0);

  // Get previous ageing state
  const previousAgeing = previous_state?.ap_ageing;
  if (!previousAgeing) {
    // First bill - generate basic insight
    return {
      category: "risk",
      level: "secondary",
      insight_text: formatInsightText(
        `You owe ${formatCurrency(amount, currency)} to ${counterparty || "this supplier"}. Expenses increased, but cash has not yet gone out.`
      ),
      insight_type: "payables_new",
      what_changed: `New payable of ${formatCurrency(amount, currency)} created`,
      why_it_changed: "Bill received from supplier",
      business_impact: "Expenses increased, cash unchanged until payment",
      confidence_level: "high",
      drill_down_targets: ["/contacts", "/reports"],
      context_json: {
        intent: "create_bill",
        amount,
        currency,
        counterparty,
        payable_amount: amount,
      },
    };
  }

  // Calculate current ageing totals
  const currentAgeingTotal = currentAgeing.reduce(
    (acc, item) => ({
      current_0_30: acc.current_0_30 + item.total_current,
      days_31_60: acc.days_31_60 + item.total_31_60,
      days_61_90: acc.days_61_90 + item.total_61_90,
      days_90_plus: acc.days_90_plus + item.total_90_plus,
    }),
    { current_0_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0 },
  );

  // Check cash pressure (Engineering Guide Section 3.3)
  const nearTermPayables = currentAgeingTotal.current_0_30 + currentAgeingTotal.days_31_60;
  const cashBalance = previous_state?.cash_balance || 0;
  const cashComfortThreshold = cashBalance * 0.3; // 30% of cash as comfort buffer

  // Check for overdue increase
  const overdueIncrease =
    currentAgeingTotal.days_31_60 +
    currentAgeingTotal.days_61_90 +
    currentAgeingTotal.days_90_plus -
    (previousAgeing.days_31_60 + previousAgeing.days_61_90 + previousAgeing.days_90_plus);

  // Generate insight based on cash pressure and timing (Engineering Guide Section 3.3)
  if (nearTermPayables > cashComfortThreshold && cashBalance > 0) {
    const insightText = `You owe ${formatCurrency(currentTotal, currency)} to suppliers, with ${formatCurrency(
      nearTermPayables,
      currency,
    )} due in the next 30 days. `;
    const hasFlexibility = nearTermPayables < cashBalance * 0.8;
    const explanation = hasFlexibility
      ? "You have short-term flexibility without damaging supplier relationships."
      : "This may create cash pressure if not managed carefully.";

    return {
      category: "risk",
      level: nearTermPayables > cashBalance * 0.8 ? "primary" : "secondary",
      insight_text: formatInsightText(insightText + explanation),
      insight_type: "payables_timing_pressure",
      what_changed: `Near-term payables (${formatCurrency(nearTermPayables, currency)}) relative to cash`,
      why_it_changed: "Bills received with near-term due dates",
      business_impact: hasFlexibility
        ? "Manageable cash timing with flexibility"
        : "Cash pressure may require payment planning",
      confidence_level: "high",
      drill_down_targets: ["/contacts", "/reports"],
      context_json: {
        intent: "create_bill",
        amount,
        currency,
        counterparty,
        near_term_payables: nearTermPayables,
        cash_balance: cashBalance,
        timing_flexibility: hasFlexibility,
      },
    };
  }

  if (overdueIncrease > 0) {
    const overdueAmount =
      currentAgeingTotal.days_31_60 + currentAgeingTotal.days_61_90 + currentAgeingTotal.days_90_plus;

    return {
      category: "risk",
      level: overdueIncrease > amount * 0.3 ? "primary" : "secondary",
      insight_text: formatInsightText(
        `Your overdue payables increased by ${formatCurrency(overdueIncrease, currency)}. This may impact supplier relationships if not addressed.`
      ),
      insight_type: "payables_overdue",
      what_changed: `Overdue payables increased by ${formatCurrency(overdueIncrease, currency)}`,
      why_it_changed: "Payments delayed beyond due dates",
      business_impact: "Supplier relationship risk and potential credit impact",
      confidence_level: "high",
      drill_down_targets: ["/contacts", "/reports"],
      context_json: {
        intent: "create_bill",
        amount,
        currency,
        counterparty,
        overdue_amount: overdueAmount,
        overdue_increase: overdueIncrease,
      },
    };
  }

  // If no meaningful change, don't generate insight
  return null;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

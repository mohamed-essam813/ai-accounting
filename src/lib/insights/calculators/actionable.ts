/**
 * Actionable Next Step Insight Calculator
 * Answers: "What should you do next?"
 */

import type { Insight, InsightContext } from "../types";
import { formatInsightText } from "../generate";

export async function generateActionableInsight(
  context: InsightContext,
): Promise<Insight | null> {
  const { intent, amount, currency, counterparty, financial_delta, previous_state } = context;

  let insightText = "";
  let level: "primary" | "secondary" = "secondary";

  // Invoice: Follow up action
  if (intent === "create_invoice" && counterparty) {
    insightText = `Follow up with ${counterparty} to ensure timely payment. `;
    insightText += "Set a reminder for the due date.";
    level = "secondary";
  }

  // Bill: Payment planning
  else if (intent === "create_bill" && financial_delta?.payable_change) {
    const totalPayables = (previous_state?.total_payables || 0) + financial_delta.payable_change;
    if (totalPayables > 20000) {
      insightText = "Plan your payment schedule to manage cash flow. ";
      insightText += "Consider prioritizing high-priority vendors.";
      level = "secondary";
    }
  }

  // Low cash: Action required
  else if (previous_state?.cash_balance !== undefined && financial_delta?.cash_change) {
    const newCashBalance = previous_state.cash_balance + financial_delta.cash_change;
    if (newCashBalance < 5000) {
      insightText = "Take action to improve cash flow: ";
      insightText += "collect outstanding receivables, delay non-essential expenses, or consider short-term financing.";
      level = "primary";
    }
  }

  // High receivables: Collection action
  else if (intent === "create_invoice" && previous_state?.total_receivables) {
    const newReceivables = previous_state.total_receivables + (financial_delta?.receivable_change || amount);
    if (newReceivables > 50000) {
      insightText = "Review your receivables aging report. ";
      insightText += "Follow up on overdue invoices to improve cash collection.";
      level = "secondary";
    }
  }

  // Tax liability: Set aside funds
  else if (financial_delta?.tax_change && financial_delta.tax_change > 0) {
    insightText = "Set aside funds for tax payments. ";
    insightText += "Consider creating a separate account for tax obligations.";
    level = "secondary";
  }

  if (!insightText) {
    return null;
  }

  return {
    category: "actionable_next_step",
    level,
    insight_text: formatInsightText(insightText),
    context_json: {
      intent,
      amount,
      currency,
      action_type: intent === "create_invoice" ? "follow_up" : intent === "create_bill" ? "payment_planning" : "cash_flow_management",
    },
  };
}


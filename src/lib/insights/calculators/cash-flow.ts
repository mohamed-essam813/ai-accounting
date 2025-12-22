/**
 * Cash Flow Insight Calculator
 * Answers: "How does this affect cash flow?"
 */

import type { Insight, InsightContext } from "../types";
import { formatInsightText } from "../generate";

export async function generateCashFlowInsight(
  context: InsightContext,
): Promise<Insight | null> {
  const { intent, amount, currency, financial_delta, previous_state } = context;

  // Only generate for transactions that affect cash or receivables/payables
  const affectsCashFlow =
    intent === "create_invoice" ||
    intent === "create_bill" ||
    intent === "record_payment" ||
    (financial_delta?.cash_change && financial_delta.cash_change !== 0);

  if (!affectsCashFlow) {
    return null;
  }

  let insightText = "";
  let level: "primary" | "secondary" = "secondary";

  // Invoice: Creates receivable, not cash
  if (intent === "create_invoice") {
    const receivableChange = financial_delta?.receivable_change || amount;
    insightText = `This invoice increased your receivables by ${formatCurrency(receivableChange, currency)}. `;
    insightText += "This is not cash yet—you'll receive payment when the customer pays.";
    level = "primary";
  }

  // Bill: Creates payable, not cash outflow yet
  else if (intent === "create_bill") {
    const payableChange = financial_delta?.payable_change || amount;
    insightText = `This bill increased your payables by ${formatCurrency(payableChange, currency)}. `;
    insightText += "This is not a cash outflow yet—you'll pay when the due date arrives.";
    level = "secondary";
  }

  // Payment received: Cash inflow
  else if (intent === "record_payment" && financial_delta?.cash_change && financial_delta.cash_change > 0) {
    insightText = `Cash increased by ${formatCurrency(financial_delta.cash_change, currency)}. `;
    if (previous_state?.cash_balance !== undefined) {
      const newBalance = previous_state.cash_balance + financial_delta.cash_change;
      insightText += `Your cash balance is now ${formatCurrency(newBalance, currency)}.`;
    } else {
      insightText += "Your cash position has improved.";
    }
    level = "primary";
  }

  // Payment made: Cash outflow
  else if (intent === "record_payment" && financial_delta?.cash_change && financial_delta.cash_change < 0) {
    insightText = `Cash decreased by ${formatCurrency(Math.abs(financial_delta.cash_change), currency)}. `;
    if (previous_state?.cash_balance !== undefined) {
      const newBalance = previous_state.cash_balance + financial_delta.cash_change;
      insightText += `Your cash balance is now ${formatCurrency(newBalance, currency)}.`;
    } else {
      insightText += "Your cash position has decreased.";
    }
    level = "primary";
  }

  // Direct cash change
  else if (financial_delta?.cash_change && financial_delta.cash_change !== 0) {
    if (financial_delta.cash_change > 0) {
      insightText = `This transaction increased cash by ${formatCurrency(financial_delta.cash_change, currency)}.`;
    } else {
      insightText = `This transaction decreased cash by ${formatCurrency(Math.abs(financial_delta.cash_change), currency)}.`;
    }
    level = "secondary";
  }

  if (!insightText) {
    return null;
  }

  return {
    category: "cash_flow",
    level,
    insight_text: formatInsightText(insightText),
    context_json: {
      intent,
      cash_change: financial_delta?.cash_change || 0,
      currency,
    },
  };
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}


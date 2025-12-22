/**
 * Risk Insight Calculator
 * Answers: "What risks does this transaction create or mitigate?"
 */

import type { Insight, InsightContext } from "../types";
import { formatInsightText } from "../generate";

export async function generateRiskInsight(
  context: InsightContext,
): Promise<Insight | null> {
  const { intent, amount, currency, counterparty, financial_delta, previous_state } = context;

  let insightText = "";
  let level: "primary" | "secondary" = "secondary";

  // Receivable risk (overdue, concentration)
  if (intent === "create_invoice" && financial_delta?.receivable_change) {
    const totalReceivables = (previous_state?.total_receivables || 0) + financial_delta.receivable_change;
    
    // Large receivable risk
    if (amount > 10000) {
      insightText = `This is a large receivable (${formatCurrency(amount, currency)}). `;
      insightText += "Monitor payment closely to avoid cash flow issues.";
      level = "primary";
    }
    // High receivables balance risk
    else if (totalReceivables > 50000) {
      insightText = `Your total receivables are now ${formatCurrency(totalReceivables, currency)}. `;
      insightText += "Consider following up on overdue invoices to improve cash flow.";
      level = "secondary";
    }
    // New counterparty risk
    else if (counterparty) {
      insightText = `New receivable from ${counterparty}. `;
      insightText += "Track payment behavior to assess credit risk.";
      level = "secondary";
    }
  }

  // Payable risk (large bills, payment timing)
  else if (intent === "create_bill" && financial_delta?.payable_change) {
    const totalPayables = (previous_state?.total_payables || 0) + financial_delta.payable_change;
    
    // Large payable risk
    if (amount > 10000) {
      insightText = `This is a large payable (${formatCurrency(amount, currency)}). `;
      insightText += "Ensure sufficient cash is available when payment is due.";
      level = "primary";
    }
    // High payables balance risk
    else if (totalPayables > 50000) {
      insightText = `Your total payables are now ${formatCurrency(totalPayables, currency)}. `;
      insightText += "Plan cash flow to cover upcoming payments.";
      level = "secondary";
    }
  }

  // Tax exposure risk
  else if (financial_delta?.tax_change && financial_delta.tax_change > 0) {
    const taxAmount = financial_delta.tax_change;
    insightText = `This transaction increased your tax liability by ${formatCurrency(taxAmount, currency)}. `;
    insightText += "Ensure you have funds set aside for tax payments.";
    level = "secondary";
  }

  // Cash flow risk (low cash balance)
  else if (previous_state?.cash_balance !== undefined && financial_delta?.cash_change) {
    const newCashBalance = previous_state.cash_balance + financial_delta.cash_change;
    if (newCashBalance < 0) {
      insightText = `Warning: Your cash balance is now negative (${formatCurrency(newCashBalance, currency)}). `;
      insightText += "Immediate action required to avoid cash flow problems.";
      level = "primary";
    } else if (newCashBalance < 5000) {
      insightText = `Your cash balance is low (${formatCurrency(newCashBalance, currency)}). `;
      insightText += "Monitor closely and consider collecting receivables or reducing expenses.";
      level = "primary";
    }
  }

  if (!insightText) {
    return null;
  }

  return {
    category: "risk",
    level,
    insight_text: formatInsightText(insightText),
    context_json: {
      intent,
      amount,
      currency,
      risk_type: intent === "create_invoice" ? "receivable" : intent === "create_bill" ? "payable" : "cash_flow",
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


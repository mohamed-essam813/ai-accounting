/**
 * Financial Impact Insight Calculator
 * Answers: "What changed financially because of this transaction?"
 */

import type { Insight, InsightContext } from "../types";
import { formatInsightText } from "../generate";

export async function generateFinancialImpactInsight(
  context: InsightContext,
): Promise<Insight | null> {
  const { intent, amount, currency, counterparty, financial_delta, accounts_affected } = context;

  if (!financial_delta) {
    return null;
  }

  const parts: string[] = [];
  const changes: string[] = [];

  // Revenue impact
  if (financial_delta.revenue_change && financial_delta.revenue_change > 0) {
    changes.push(`revenue increased by ${formatCurrency(financial_delta.revenue_change, currency)}`);
  }

  // Expense impact
  if (financial_delta.expense_change && financial_delta.expense_change > 0) {
    changes.push(`expenses increased by ${formatCurrency(financial_delta.expense_change, currency)}`);
  }

  // Receivable impact
  if (financial_delta.receivable_change) {
    if (financial_delta.receivable_change > 0) {
      changes.push(`you're now waiting to collect ${formatCurrency(financial_delta.receivable_change, currency)}`);
      if (counterparty) {
        parts.push(`You are now waiting to collect ${formatCurrency(financial_delta.receivable_change, currency)} from ${counterparty}.`);
      }
    } else {
      changes.push(`receivables decreased by ${formatCurrency(Math.abs(financial_delta.receivable_change), currency)}`);
    }
  }

  // Payable impact
  if (financial_delta.payable_change) {
    if (financial_delta.payable_change > 0) {
      changes.push(`you now owe ${formatCurrency(financial_delta.payable_change, currency)}`);
      if (counterparty) {
        parts.push(`You now owe ${formatCurrency(financial_delta.payable_change, currency)} to ${counterparty}.`);
      }
    } else {
      changes.push(`payables decreased by ${formatCurrency(Math.abs(financial_delta.payable_change), currency)}`);
    }
  }

  // Cash impact
  if (financial_delta.cash_change) {
    if (financial_delta.cash_change > 0) {
      changes.push(`cash increased by ${formatCurrency(financial_delta.cash_change, currency)}`);
    } else {
      changes.push(`cash decreased by ${formatCurrency(Math.abs(financial_delta.cash_change), currency)}`);
    }
  }

  // Tax impact
  if (financial_delta.tax_change && financial_delta.tax_change !== 0) {
    if (financial_delta.tax_change > 0) {
      changes.push(`tax liability increased by ${formatCurrency(financial_delta.tax_change, currency)}`);
    } else {
      changes.push(`tax liability decreased by ${formatCurrency(Math.abs(financial_delta.tax_change), currency)}`);
    }
  }

  if (parts.length === 0 && changes.length === 0) {
    return null;
  }

  // Build insight text
  let insightText = "";
  if (parts.length > 0) {
    insightText = parts[0];
  } else if (changes.length > 0) {
    insightText = `This transaction ${changes[0]}.`;
  }

  // Add "why this matters" context
  if (intent === "create_invoice" && financial_delta.receivable_change && financial_delta.receivable_change > 0) {
    insightText += " This is not cash yet—you'll receive payment later.";
  } else if (intent === "create_bill" && financial_delta.payable_change && financial_delta.payable_change > 0) {
    insightText += " This is an expense that will be paid later.";
  } else if (intent === "record_payment" && financial_delta.cash_change) {
    if (financial_delta.cash_change > 0) {
      insightText += " Your cash position has improved.";
    } else {
      insightText += " Your cash position has decreased.";
    }
  }

  if (!insightText) {
    return null;
  }

  return {
    category: "financial_impact",
    level: "primary",
    insight_text: formatInsightText(insightText),
    context_json: {
      financial_delta,
      intent,
      amount,
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


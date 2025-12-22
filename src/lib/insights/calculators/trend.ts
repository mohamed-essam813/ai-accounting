/**
 * Trend/Behavior Insight Calculator
 * Answers: "What patterns or trends does this reveal?"
 */

import type { Insight, InsightContext } from "../types";
import { formatInsightText } from "../generate";

export async function generateTrendInsight(
  context: InsightContext,
): Promise<Insight | null> {
  const { intent, amount, currency, financial_delta, previous_state } = context;

  // Trend insights require historical context, which we don't have in basic implementation
  // This is a placeholder for future enhancement with historical data analysis
  
  // For now, we'll generate simple trend insights based on current state
  let insightText = "";
  let level: "primary" | "secondary" | "deep_dive" = "secondary";

  // Revenue momentum
  if (intent === "create_invoice" && financial_delta?.revenue_change) {
    const revenueYtd = (previous_state?.revenue_ytd || 0) + financial_delta.revenue_change;
    
    if (revenueYtd > 0) {
      // Simple trend: if this is a significant portion of YTD revenue
      const percentage = (financial_delta.revenue_change / revenueYtd) * 100;
      if (percentage > 20) {
        insightText = `This invoice represents ${percentage.toFixed(0)}% of your year-to-date revenue. `;
        insightText += "This is a significant transaction for your business.";
        level = "secondary";
      }
    }
  }

  // Expense growth
  else if (intent === "create_bill" && financial_delta?.expense_change) {
    const expensesYtd = (previous_state?.expenses_ytd || 0) + financial_delta.expense_change;
    
    if (expensesYtd > 0) {
      const percentage = (financial_delta.expense_change / expensesYtd) * 100;
      if (percentage > 15) {
        insightText = `This expense represents ${percentage.toFixed(0)}% of your year-to-date expenses. `;
        insightText += "Monitor expense growth to maintain profitability.";
        level = "secondary";
      }
    }
  }

  // Expense vs Revenue trend
  if (previous_state?.revenue_ytd && previous_state?.expenses_ytd) {
    const revenueYtd = previous_state.revenue_ytd + (financial_delta?.revenue_change || 0);
    const expensesYtd = previous_state.expenses_ytd + (financial_delta?.expense_change || 0);
    
    if (expensesYtd > 0 && revenueYtd > 0) {
      const expenseRatio = (expensesYtd / revenueYtd) * 100;
      if (expenseRatio > 80) {
        insightText = `Your expenses are ${expenseRatio.toFixed(0)}% of revenue. `;
        insightText += "Expenses are growing faster than revenue—consider cost optimization.";
        level = "primary";
      }
    }
  }

  if (!insightText) {
    return null;
  }

  return {
    category: "trend_behavior",
    level,
    insight_text: formatInsightText(insightText),
    context_json: {
      intent,
      amount,
      currency,
    },
  };
}


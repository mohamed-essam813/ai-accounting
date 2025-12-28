/**
 * Insight Engine - Core Generation Logic
 * Generates contextual insights based on financial deltas
 * PRD Section 7: Insights Framework
 */

import type { Insight, InsightContext, GeneratedInsights } from "./types";
import { generateFinancialImpactInsight } from "./calculators/financial-impact";
import { generateCashFlowInsight } from "./calculators/cash-flow";
import { generateRiskInsight } from "./calculators/risk";
import { generateTrendInsight } from "./calculators/trend";
import { generateActionableInsight } from "./calculators/actionable";

const MAX_PRIMARY_INSIGHTS = 2;

/**
 * Generate insights for a transaction
 * PRD Rule: Max 2 insights per action, plain language only, always answer "why this matters"
 * Engineering Guide Section 3.1: Only generate if meaningful change detected
 */
export async function generateInsights(
  context: InsightContext & { tenant_id: string },
): Promise<GeneratedInsights> {
  // Engineering Guide Section 3.1: Check if meaningful change occurred
  // If nothing changed meaningfully → no insight (silence is valid)
  if (!hasMeaningfulChange(context)) {
    return {
      primary: [],
      secondary: [],
      deep_dive: [],
    };
  }

  const insights: GeneratedInsights = {
    primary: [],
    secondary: [],
    deep_dive: [],
  };

  // Generate insights for each category
  const allInsights: Array<{ insight: Insight; priority: number }> = [];

  // Financial Impact (always relevant)
  const financialImpact = await generateFinancialImpactInsight(context);
  if (financialImpact) {
    allInsights.push({ insight: financialImpact, priority: 1 });
  }

  // Cash Flow (always relevant for invoices/bills/payments)
  const cashFlow = await generateCashFlowInsight(context);
  if (cashFlow) {
    allInsights.push({ insight: cashFlow, priority: 1 });
  }

  // Risk (for receivables, payables, tax)
  const risk = await generateRiskInsight(context);
  if (risk) {
    allInsights.push({ insight: risk, priority: 2 });
  }

  // Trend/Behavior (for patterns)
  const trend = await generateTrendInsight(context);
  if (trend) {
    allInsights.push({ insight: trend, priority: 3 });
  }

  // Actionable Next Step (when applicable)
  const actionable = await generateActionableInsight(context);
  if (actionable) {
    allInsights.push({ insight: actionable, priority: 1 });
  }

  // Sort by priority and select top insights
  allInsights.sort((a, b) => a.priority - b.priority);

  // Select primary insights (max 2)
  const primaryInsights = allInsights
    .filter((item) => item.insight.level === "primary")
    .slice(0, MAX_PRIMARY_INSIGHTS)
    .map((item) => item.insight);

  // Select secondary insights (max 2)
  const secondaryInsights = allInsights
    .filter((item) => item.insight.level === "secondary")
    .slice(0, 2)
    .map((item) => item.insight);

  // Deep dive insights (optional, unlimited but typically 0-1)
  const deepDiveInsights = allInsights
    .filter((item) => item.insight.level === "deep_dive")
    .map((item) => item.insight);

  insights.primary = primaryInsights;
  insights.secondary = secondaryInsights;
  insights.deep_dive = deepDiveInsights;

  return insights;
}

/**
 * Engineering Guide Section 3.1: Insight Trigger Conditions
 * An insight is generated only if at least one of the following changes:
 * - Ageing bucket movement
 * - Trend direction change
 * - Risk threshold crossed
 * - Cash impact delta detected
 */
function hasMeaningfulChange(context: InsightContext & { tenant_id: string }): boolean {
  const { financial_delta, previous_state } = context;

  // Check for cash impact delta
  if (financial_delta?.cash_change && Math.abs(financial_delta.cash_change) > 0) {
    return true;
  }

  // Check for risk threshold crossed (cash balance)
  if (previous_state?.cash_balance !== undefined && financial_delta?.cash_change) {
    const newCashBalance = previous_state.cash_balance + financial_delta.cash_change;
    if (newCashBalance < 0 || newCashBalance < 5000) {
      return true; // Risk threshold crossed
    }
  }

  // Check for ageing bucket movement (for AR/AP)
  if (context.intent === "create_invoice" || context.intent === "create_bill") {
    // Ageing changes will be checked in the specific calculators
    // But we know there's a transaction, so allow generation
    return true;
  }

  // Check for revenue/expense changes
  if (financial_delta?.revenue_change && Math.abs(financial_delta.revenue_change) > 0) {
    return true;
  }
  if (financial_delta?.expense_change && Math.abs(financial_delta.expense_change) > 0) {
    return true;
  }

  // Check for tax changes
  if (financial_delta?.tax_change && Math.abs(financial_delta.tax_change) > 0) {
    return true;
  }

  // Check for receivables/payables changes
  if (financial_delta?.receivable_change && Math.abs(financial_delta.receivable_change) > 0) {
    return true;
  }
  if (financial_delta?.payable_change && Math.abs(financial_delta.payable_change) > 0) {
    return true;
  }

  // If no meaningful change detected, return false (silence is valid)
  return false;
}

/**
 * Format insight text to ensure plain language
 * PRD: "Plain language only"
 * UX Composition Section 2.2: Must use plain business language, never say "Dr/Cr", "AR increased"
 */
export function formatInsightText(text: string): string {
  // Remove accounting jargon, ensure clarity
  return text
    .replace(/DR\s+/gi, "")
    .replace(/CR\s+/gi, "")
    .replace(/AR\s+/gi, "receivables ")
    .replace(/AP\s+/gi, "payables ")
    .replace(/Accounts Receivable/gi, "receivables")
    .replace(/Accounts Payable/gi, "payables")
    .replace(/P&L/gi, "profit and loss")
    .replace(/\s+/g, " ") // Remove extra spaces
    .trim();
}


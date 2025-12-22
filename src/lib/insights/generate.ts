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
 */
export async function generateInsights(
  context: InsightContext & { tenant_id: string },
): Promise<GeneratedInsights> {
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
 * Format insight text to ensure plain language
 * PRD: "Plain language only"
 */
export function formatInsightText(text: string): string {
  // Remove accounting jargon, ensure clarity
  return text
    .replace(/DR\s+/gi, "debit ")
    .replace(/CR\s+/gi, "credit ")
    .replace(/AR\s+/gi, "accounts receivable ")
    .replace(/AP\s+/gi, "accounts payable ")
    .replace(/P&L/gi, "profit and loss")
    .trim();
}


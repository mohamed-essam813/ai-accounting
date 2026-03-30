/**
 * RevenuesFlow BRD §8 / Layer 4 — structured insight shape:
 * Observation → Risk or Opportunity → Recommended Action → Expected Impact
 */

import type { Insight, PrdInsightShape } from "./types";

export type { PrdInsightShape };

export function normalizePrdInsight(insight: Insight): PrdInsightShape {
  if (insight.prd) {
    return insight.prd;
  }
  const fromContext = insight.context_json?.prd as PrdInsightShape | undefined;
  if (
    fromContext?.observation &&
    fromContext?.risk_or_opportunity &&
    fromContext?.recommended_action &&
    fromContext?.expected_impact
  ) {
    return fromContext;
  }
  const obs = insight.insight_text?.trim() || "Financial activity recorded.";
  const risk =
    insight.business_impact?.trim() ||
    insight.what_changed?.trim() ||
    "Monitor cash, receivables, and payables as activity grows.";
  const action =
    (insight.drill_down_targets?.length
      ? `Review: ${insight.drill_down_targets.join(", ")}`
      : "Review the General Ledger and reports for this period.") || "Review reports for detail.";
  const impact =
    insight.why_it_changed?.trim() ||
    insight.business_impact?.trim() ||
    "Clearer visibility into how this transaction affects your books.";
  return {
    observation: obs,
    risk_or_opportunity: risk,
    recommended_action: action,
    expected_impact: impact,
  };
}

export function prdToContextJson(insight: Insight): Record<string, unknown> {
  const prd = normalizePrdInsight(insight);
  return {
    prd,
    ...insight.context_json,
  };
}

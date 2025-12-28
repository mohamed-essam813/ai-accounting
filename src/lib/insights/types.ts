/**
 * Insight Engine Types
 * Based on PRD Section 7: Insights Framework
 */

export type InsightCategory =
  | "financial_impact"
  | "cash_flow"
  | "risk"
  | "trend_behavior"
  | "actionable_next_step";

export type InsightLevel = "primary" | "secondary" | "deep_dive";

export interface Insight {
  id?: string;
  tenant_id?: string; // Optional - added when saving to database
  journal_entry_id?: string;
  draft_id?: string;
  category: InsightCategory;
  level: InsightLevel;
  insight_text: string;
  context_json?: Record<string, unknown>;
  created_at?: string;
  // Engineering Guide Section 3.4: Required fields for insight output contract
  insight_type?: string; // Type of insight (e.g., "receivables_ageing", "payables_pressure")
  what_changed?: string; // What changed in plain language
  why_it_changed?: string; // Why it changed
  business_impact?: string; // Impact on cash, risk, or performance
  confidence_level?: "high" | "medium" | "low"; // Confidence in the insight
  drill_down_targets?: string[]; // Paths to related screens/data
}

export interface InsightContext {
  journal_entry_id?: string;
  draft_id?: string;
  intent?: string;
  amount: number;
  currency: string;
  counterparty?: string | null;
  date: string;
  description: string;
  accounts_affected: Array<{
    account_id: string;
    account_name: string;
    account_code: string;
    account_type: string;
    debit: number;
    credit: number;
  }>;
  financial_delta?: {
    revenue_change?: number;
    expense_change?: number;
    cash_change?: number;
    receivable_change?: number;
    payable_change?: number;
    tax_change?: number;
  };
  previous_state?: {
    total_receivables?: number;
    total_payables?: number;
    cash_balance?: number;
    revenue_ytd?: number;
    expenses_ytd?: number;
    // Ageing data for AR/AP insights (Engineering Guide Section 3.2 & 3.3)
    ar_ageing?: {
      current_0_30: number;
      days_31_60: number;
      days_61_90: number;
      days_90_plus: number;
      total_outstanding: number;
    };
    ap_ageing?: {
      current_0_30: number;
      days_31_60: number;
      days_61_90: number;
      days_90_plus: number;
      total_outstanding: number;
    };
  };
}

export interface GeneratedInsights {
  primary: Insight[];
  secondary: Insight[];
  deep_dive?: Insight[];
}

/**
 * PRD Rule: Max 2 insights per action
 * We'll generate 1-2 primary insights and optionally secondary/deep dive
 */
export const MAX_PRIMARY_INSIGHTS = 2;
export const MAX_SECONDARY_INSIGHTS = 2;


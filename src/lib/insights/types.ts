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


import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

type ProfitAndLossView = Database["public"]["Views"]["v_profit_and_loss"]["Row"];
type TrialBalanceView = Database["public"]["Views"]["v_trial_balance"]["Row"];

export async function getDashboardMetrics() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      drafts: 0,
      approvalsPending: 0,
      postedEntries: 0,
      revenue: 0,
      expenses: 0,
      netIncome: 0,
      cashBalance: 0,
    };
  }

  const supabase = await createServerSupabaseClient();
  const tenantId = user.tenant.id;

  // Type assertions to fix Supabase type inference
  const draftsTable = supabase.from("drafts") as unknown as {
    select: (columns: string, options?: { count?: string; head?: boolean }) => {
      eq: (column: string, value: string) => Promise<{ count: number | null; error: unknown }>;
    };
  };
  const draftsSelectTable = supabase.from("drafts") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ data: Array<{ id: string }> | null; error: unknown }>;
      };
    };
  };
  const journalEntriesTable = supabase.from("journal_entries") as unknown as {
    select: (columns: string, options?: { count?: string; head?: boolean }) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ count: number | null; error: unknown }>;
      };
    };
  };
  const pnlView = supabase.from("v_profit_and_loss") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: ProfitAndLossView | null; error: unknown }>;
      };
    };
  };
  const trialBalanceView = supabase.from("v_trial_balance") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: TrialBalanceView | null; error: unknown }>;
        };
      };
    };
  };

  const [{ count: draftsCount }, { data: approvals }, { count: postedCount }, { data: pnl }, { data: cashBalance }] =
    await Promise.all([
      draftsTable.select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      draftsSelectTable
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("status", "draft"),
      journalEntriesTable
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "posted"),
      pnlView.select("*").eq("tenant_id", tenantId).maybeSingle(),
      trialBalanceView
        .select("total_debit, total_credit")
        .eq("tenant_id", tenantId)
        .eq("code", "1000")
        .maybeSingle(),
    ]);

  return {
    drafts: draftsCount ?? 0,
    approvalsPending: approvals?.length ?? 0,
    postedEntries: postedCount ?? 0,
    revenue: pnl?.total_revenue ? Number(pnl.total_revenue) : 0,
    expenses: pnl?.total_expense ? Number(pnl.total_expense) : 0,
    netIncome: pnl?.net_income ? Number(pnl.net_income) : 0,
    cashBalance:
      cashBalance && cashBalance.total_debit && cashBalance.total_credit
        ? Number(cashBalance.total_debit) - Number(cashBalance.total_credit)
        : 0,
  };
}


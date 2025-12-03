import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "../database.types";

type ProfitAndLoss = Database["public"]["Views"]["v_profit_and_loss"]["Row"];
type BalanceSheet = Database["public"]["Views"]["v_balance_sheet"]["Row"];
type TrialBalance = Database["public"]["Views"]["v_trial_balance"]["Row"];

export async function getProfitAndLoss(): Promise<ProfitAndLoss | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("v_profit_and_loss")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getBalanceSheet(): Promise<BalanceSheet | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("v_balance_sheet")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getTrialBalance(): Promise<TrialBalance[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("v_trial_balance")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("code");

  if (error) throw error;
  return data ?? [];
}

type CashFlow = { tenant_id: string; net_cash_flow: number | null };
type JournalLedger = {
  tenant_id: string;
  entry_id: string;
  date: string;
  description: string;
  status: string;
  created_at: string;
  account_code: string;
  account_name: string;
  debit: number | null;
  credit: number | null;
  memo: string | null;
};
type VATReport = {
  tenant_id: string;
  vat_output_tax: number | null;
  vat_input_tax: number | null;
  vat_payable: number | null;
};

export async function getCashFlow(): Promise<CashFlow | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  // Type assertion for new view (not yet in database types)
  const table = (supabase as any).from("v_cash_flow") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: CashFlow | null; error: unknown }>;
      };
    };
  };
  const { data, error } = await table.select("*").eq("tenant_id", user.tenant.id).maybeSingle();

  if (error) throw error;
  return data;
}

export async function getJournalLedger(startDate?: string, endDate?: string): Promise<JournalLedger[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  // Type assertion for new view (not yet in database types)
  let query = (supabase as any).from("v_journal_ledger") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        gte?: (column: string, value: string) => {
          lte?: (column: string, value: string) => {
            order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
          };
          order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
        };
        lte?: (column: string, value: string) => {
          order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
        };
        order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
      };
    };
  };

  let q: any = query.select("*").eq("tenant_id", user.tenant.id);
  if (startDate && q.gte) {
    q = q.gte("date", startDate);
  }
  if (endDate && q.lte) {
    q = q.lte("date", endDate);
  }
  const { data, error } = await q.order("date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getVATReport(): Promise<VATReport | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  // Type assertion for new view (not yet in database types)
  const table = (supabase as any).from("v_vat_report") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: VATReport | null; error: unknown }>;
      };
    };
  };
  const { data, error } = await table.select("*").eq("tenant_id", user.tenant.id).maybeSingle();

  if (error) throw error;
  return data;
}


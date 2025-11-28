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


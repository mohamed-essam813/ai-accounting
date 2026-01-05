import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "../database.types";

type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
type AppUser = Database["public"]["Tables"]["app_users"]["Row"];
type PendingInvite = Database["public"]["Tables"]["pending_invites"]["Row"];

export async function getTenantProfile(): Promise<Tenant | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", user.tenant.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listTenantUsers(): Promise<AppUser[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listPendingInvites(): Promise<PendingInvite[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("pending_invites")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export interface AccountingPolicy {
  id: string;
  tenant_id: string;
  inventory_valuation_method: "fifo" | "weighted_average";
  effective_date: string;
  created_at: string;
  updated_at: string;
}

export async function getAccountingPolicy(): Promise<AccountingPolicy | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) return null;

  const supabase = await createServerSupabaseClient();
  // Using type assertion since table may not be in generated types yet
  const { data, error } = await supabase
    .from("accounting_policies" as any)
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) throw error;
  return data as AccountingPolicy | null;
}

export interface AccountingPolicyChange {
  id: string;
  tenant_id: string;
  policy_type: string;
  previous_value: string | null;
  new_value: string;
  changed_by: string;
  reason: string;
  effective_date: string;
  created_at: string;
}

export async function listAccountingPolicyChanges(): Promise<AccountingPolicyChange[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  // Using type assertion since table may not be in generated types yet
  const { data, error } = await supabase
    .from("accounting_policy_changes" as any)
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as AccountingPolicyChange[];
}


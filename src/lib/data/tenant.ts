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


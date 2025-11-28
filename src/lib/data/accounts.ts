import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

export async function listAccounts() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("code");

  if (error) {
    console.error("Failed to load accounts", error);
    throw error;
  }

  return data ?? [];
}

export async function getAccountByCode(code: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("code", code)
    .maybeSingle();

  return data ?? null;
}

/**
 * Ensure default accounts exist for a tenant
 * Creates the standard chart of accounts if they don't exist
 */
export async function ensureDefaultAccounts(tenantId: string) {
  const supabase = await createServerSupabaseClient();
  
  const defaultAccounts = [
    { code: "1000", name: "Cash", type: "asset" as const },
    { code: "1100", name: "Accounts Receivable", type: "asset" as const },
    { code: "2000", name: "Accounts Payable", type: "liability" as const },
    { code: "2100", name: "VAT Output Tax", type: "liability" as const },
    { code: "4000", name: "Sales Revenue", type: "revenue" as const },
    { code: "5000", name: "Consulting Expense", type: "expense" as const },
    { code: "5100", name: "VAT Input Tax", type: "asset" as const },
  ];

  // Check which accounts already exist
  const { data: existing } = await supabase
    .from("chart_of_accounts")
    .select("code")
    .eq("tenant_id", tenantId)
    .in("code", defaultAccounts.map((a) => a.code));

  const existingCodes = new Set(existing?.map((a) => a.code) ?? []);
  const accountsToCreate = defaultAccounts.filter((a) => !existingCodes.has(a.code));

  if (accountsToCreate.length === 0) {
    return; // All accounts already exist
  }

  // Insert missing accounts
  const { error } = await supabase.from("chart_of_accounts").insert(
    accountsToCreate.map((account) => ({
      tenant_id: tenantId,
      ...account,
    })),
  );

  if (error) {
    console.error("Failed to create default accounts", error);
    throw error;
  }

  console.log(`Created ${accountsToCreate.length} default accounts for tenant ${tenantId}`);
}

export type IntentAccountMapping =
  Database["public"]["Tables"]["intent_account_mappings"]["Row"];

export async function listIntentAccountMappings() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("intent_account_mappings")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("intent");

  if (error) {
    console.error("Failed to load intent mappings", error);
    throw error;
  }

  return data ?? [];
}

export async function getIntentAccountMapping(intent: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("intent_account_mappings")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("intent", intent)
    .maybeSingle();

  if (error) {
    console.error("Failed to load intent mapping", error);
    throw error;
  }

  return data ?? null;
}

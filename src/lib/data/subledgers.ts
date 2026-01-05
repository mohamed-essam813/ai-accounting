import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";

// Subledger types (will be in database.types.ts after migration runs)
export type Subledger = {
  id: string;
  tenant_id: string;
  contact_id: string;
  gl_account_id: string;
  subledger_type: "ar" | "ap";
  balance: number;
  created_at: string;
  updated_at: string;
};

/**
 * Get subledger for a contact
 */
export async function getSubledgerByContact(contactId: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("subledgers")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load subledger", error);
    throw error;
  }

  return data;
}

/**
 * Get subledger by contact and GL account
 */
export async function getSubledger(contactId: string, glAccountId: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  // @ts-ignore - subledgers table will exist after migration runs
  const { data, error } = await (supabase as any)
    .from("subledgers")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("contact_id", contactId)
    .eq("gl_account_id", glAccountId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load subledger", error);
    throw error;
  }

  return data;
}

/**
 * Get all subledgers for a GL account (e.g., all customer subledgers for AR)
 */
export async function getSubledgersByGLAccount(glAccountId: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  // @ts-ignore - subledgers table will exist after migration runs
  const { data, error } = await (supabase as any)
    .from("subledgers")
    .select("*, contacts(*)")
    .eq("tenant_id", user.tenant.id)
    .eq("gl_account_id", glAccountId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load subledgers", error);
    throw error;
  }

  return data ?? [];
}


import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

export type InvoiceListRow = Database["public"]["Tables"]["invoices"]["Row"];

export async function listPostedInvoices(limit = 100): Promise<InvoiceListRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("invoice_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listPostedInvoices", error);
    return [];
  }
  return (data ?? []) as InvoiceListRow[];
}

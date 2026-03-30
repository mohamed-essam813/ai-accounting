import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

export type BillListRow = Database["public"]["Tables"]["bills"]["Row"];

export async function listPostedBills(limit = 100): Promise<BillListRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("bills")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("bill_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listPostedBills", error);
    return [];
  }
  return (data ?? []) as BillListRow[];
}

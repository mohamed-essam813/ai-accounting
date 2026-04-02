import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

export type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

export type ReceiptListRow = PaymentRow & {
  contact_name: string | null;
};

export async function listPostedReceipts(limit = 200): Promise<ReceiptListRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data: payments, error } = await supabase
    .from("payments")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("payment_type", "receipt")
    .order("payment_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listPostedReceipts", error);
    return [];
  }

  const rows = (payments ?? []) as PaymentRow[];
  const contactIds = [...new Set(rows.map((p) => p.contact_id).filter(Boolean))] as string[];

  let nameById = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name")
      .in("id", contactIds);
    nameById = new Map((contacts ?? []).map((c) => [c.id, c.name]));
  }

  return rows.map((p) => ({
    ...p,
    contact_name: p.contact_id ? nameById.get(p.contact_id) ?? null : null,
  }));
}


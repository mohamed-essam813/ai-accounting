import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type ReceiptAllocInput = { invoice_id: string; allocated_amount: number };

/** Exported for tests — matches e.g. INV-2026-0017 in journal memos / descriptions. */
export const INV_NUMBER_PATTERN = /\bINV[-–]\d{4}-\d+\b/i;

/**
 * When draft has no receipt_allocations_draft, infer allocations from reference text
 * (e.g. "Ref: INV-2026-0017") or a single open invoice for the customer.
 */
export async function inferReceiptAllocationsForPosting(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string;
    contactId: string | null;
    paymentAmount: number;
    entities: Record<string, unknown>;
    draftData: Record<string, unknown>;
  },
): Promise<ReceiptAllocInput[]> {
  const { tenantId, contactId, paymentAmount, entities, draftData } = params;
  if (!contactId || !Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return [];
  }

  const text = [
    typeof entities.description === "string" ? entities.description : "",
    typeof entities.reference === "string" ? entities.reference : "",
    typeof draftData.description === "string" ? draftData.description : "",
  ]
    .join(" ")
    .trim();

  const match = text.match(INV_NUMBER_PATTERN);
  if (match) {
    const invoiceNumber = match[0].replace(/[–]/g, "-");
    let inv: {
      id: string;
      outstanding_amount: number | null;
      invoice_number: string | null;
    } | null = null;
    const exact = await supabase
      .from("invoices")
      .select("id, outstanding_amount, invoice_number")
      .eq("tenant_id", tenantId)
      .eq("customer_id", contactId)
      .eq("invoice_number", invoiceNumber)
      .maybeSingle();
    inv = exact.data;
    if (!inv) {
      const fuzzy = await supabase
        .from("invoices")
        .select("id, outstanding_amount, invoice_number")
        .eq("tenant_id", tenantId)
        .eq("customer_id", contactId)
        .ilike("invoice_number", invoiceNumber)
        .maybeSingle();
      inv = fuzzy.data;
    }

    if (inv) {
      const out = Number(inv.outstanding_amount ?? 0);
      const alloc = Math.min(paymentAmount, out > 0 ? out : paymentAmount);
      if (alloc > 0) {
        return [{ invoice_id: inv.id, allocated_amount: Number(alloc.toFixed(2)) }];
      }
    }
  }

  const { data: open } = await supabase
    .from("invoices")
    .select("id, outstanding_amount")
    .eq("tenant_id", tenantId)
    .eq("customer_id", contactId)
    .gt("outstanding_amount", 0)
    .order("invoice_date", { ascending: true })
    .limit(2);

  if (open?.length === 1) {
    const out = Number(open[0].outstanding_amount ?? 0);
    const alloc = Math.min(paymentAmount, out);
    if (alloc > 0) {
      return [{ invoice_id: open[0].id, allocated_amount: Number(alloc.toFixed(2)) }];
    }
  }

  return [];
}

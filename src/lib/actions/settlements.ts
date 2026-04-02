"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { getErrorMessage } from "@/lib/utils";

const ReceiptAllocationInput = z.object({
  receiptId: z.string().uuid(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        amount: z.number().positive(),
      }),
    )
    .min(1),
});

const PaymentAllocationInput = z.object({
  paymentId: z.string().uuid(),
  allocations: z
    .array(
      z.object({
        billId: z.string().uuid(),
        amount: z.number().positive(),
      }),
    )
    .min(1),
});

export async function applyReceiptAllocationsAction(input: z.infer<typeof ReceiptAllocationInput>) {
  const payload = ReceiptAllocationInput.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");
  const tenantId = user.tenant.id;

  const supabase = await createServerSupabaseClient();
  const { data: receipt, error: rErr } = await supabase
    .from("payments")
    .select("id, tenant_id, payment_type, amount, contact_id")
    .eq("id", payload.receiptId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (rErr || !receipt) throw new Error("Receipt not found.");
  if ((receipt as { payment_type?: string }).payment_type !== "receipt") {
    throw new Error("Selected row is not a receipt.");
  }

  const totalAlloc = payload.allocations.reduce((s, a) => s + a.amount, 0);
  const receiptAmt = Number((receipt as { amount: number }).amount);
  if (totalAlloc - receiptAmt > 0.01) {
    throw new Error("Total allocations cannot exceed receipt amount.");
  }

  // Validate invoices belong to tenant and (optionally) same customer
  const invoiceIds = payload.allocations.map((a) => a.invoiceId);
  const invTable = supabase.from("invoices") as unknown as {
    select: (cols: string) => any;
  };
  const { data: invoices, error: iErr } = await (invTable as any)
    .select("id, tenant_id, customer_id, outstanding_amount")
    .eq("tenant_id", tenantId)
    .in("id", invoiceIds);
  if (iErr) throw new Error(getErrorMessage(iErr, "Failed to load invoices."));
  const invById = new Map((invoices ?? []).map((i: any) => [i.id, i]));
  for (const a of payload.allocations) {
    const inv = invById.get(a.invoiceId);
    if (!inv) throw new Error("One or more invoices not found.");
    const out = Number((inv as { outstanding_amount: number }).outstanding_amount ?? 0);
    if (a.amount - out > 0.01) throw new Error("Allocation exceeds invoice outstanding amount.");
    const invCust = (inv as { customer_id?: string | null }).customer_id ?? null;
    const rCust = (receipt as { contact_id?: string | null }).contact_id ?? null;
    if (rCust && invCust && invCust !== rCust) {
      throw new Error("Receipt customer does not match invoice customer.");
    }
  }

  // Replace allocations (simple, idempotent for MVP)
  const receiptAllocTable = supabase.from("receipt_allocations" as never) as unknown as {
    delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
    insert: (values: any[]) => Promise<{ error: unknown }>;
  };
  await receiptAllocTable.delete().eq("receipt_id", payload.receiptId);
  const rows = payload.allocations.map((a) => ({
    tenant_id: tenantId,
    receipt_id: payload.receiptId,
    invoice_id: a.invoiceId,
    allocated_amount: a.amount,
  }));
  const { error: insErr } = await receiptAllocTable.insert(rows);
  if (insErr) throw new Error(getErrorMessage(insErr, "Failed to apply allocations."));

  return { ok: true as const };
}

export async function applyPaymentAllocationsAction(input: z.infer<typeof PaymentAllocationInput>) {
  const payload = PaymentAllocationInput.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");
  const tenantId = user.tenant.id;

  const supabase = await createServerSupabaseClient();
  const { data: payment, error: pErr } = await supabase
    .from("payments")
    .select("id, tenant_id, payment_type, amount, contact_id")
    .eq("id", payload.paymentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (pErr || !payment) throw new Error("Payment not found.");
  if ((payment as { payment_type?: string }).payment_type !== "payment") {
    throw new Error("Selected row is not a supplier payment.");
  }

  const totalAlloc = payload.allocations.reduce((s, a) => s + a.amount, 0);
  const payAmt = Number((payment as { amount: number }).amount);
  if (totalAlloc - payAmt > 0.01) {
    throw new Error("Total allocations cannot exceed payment amount.");
  }

  const billIds = payload.allocations.map((a) => a.billId);
  const billTable = supabase.from("bills") as unknown as {
    select: (cols: string) => any;
  };
  const { data: bills, error: bErr } = await (billTable as any)
    .select("id, tenant_id, supplier_id, outstanding_amount")
    .eq("tenant_id", tenantId)
    .in("id", billIds);
  if (bErr) throw new Error(getErrorMessage(bErr, "Failed to load bills."));
  const billById = new Map((bills ?? []).map((b: any) => [b.id, b]));
  for (const a of payload.allocations) {
    const bill = billById.get(a.billId);
    if (!bill) throw new Error("One or more bills not found.");
    const out = Number((bill as { outstanding_amount: number }).outstanding_amount ?? 0);
    if (a.amount - out > 0.01) throw new Error("Allocation exceeds bill outstanding amount.");
    const billSupp = (bill as { supplier_id?: string | null }).supplier_id ?? null;
    const pSupp = (payment as { contact_id?: string | null }).contact_id ?? null;
    if (pSupp && billSupp && billSupp !== pSupp) {
      throw new Error("Payment supplier does not match bill supplier.");
    }
  }

  const paymentAllocTable = supabase.from("payment_allocations" as never) as unknown as {
    delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
    insert: (values: any[]) => Promise<{ error: unknown }>;
  };
  await paymentAllocTable.delete().eq("payment_id", payload.paymentId);
  const rows = payload.allocations.map((a) => ({
    tenant_id: tenantId,
    payment_id: payload.paymentId,
    bill_id: a.billId,
    allocated_amount: a.amount,
  }));
  const { error: insErr } = await paymentAllocTable.insert(rows);
  if (insErr) throw new Error(getErrorMessage(insErr, "Failed to apply allocations."));

  return { ok: true as const };
}


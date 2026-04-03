"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";

const ListInvoicesSchema = z.object({
  contactId: z.string().uuid(),
  /** When true, include fully paid invoices (for review); default only open balance. */
  includeSettled: z.boolean().optional(),
});

const ListBillsSchema = z.object({
  contactId: z.string().uuid(),
  includeSettled: z.boolean().optional(),
});

export type OpenInvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  total_amount: number;
  amount_received: number;
  outstanding_amount: number;
  settlement_status: string;
};

export type OpenBillRow = {
  id: string;
  bill_number: string | null;
  bill_date: string;
  total_amount: number;
  amount_paid: number;
  outstanding_amount: number;
  settlement_status: string;
};

export async function listOpenInvoicesForCustomerAction(
  input: z.infer<typeof ListInvoicesSchema>,
) {
  const { contactId, includeSettled } = ListInvoicesSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) return [];
  const supabase = await createServerSupabaseClient();
  const table = supabase.from("invoices") as unknown as {
    select: (cols: string) => {
      eq: (c: string, v: string) => any;
      gt: (c: string, v: number) => any;
      order: (c: string, o: { ascending: boolean }) => any;
      limit: (n: number) => Promise<{ data: any[] | null }>;
    };
  };
  let q = (table as any)
    .select(
      "id, invoice_number, invoice_date, total_amount, outstanding_amount, amount_received, settlement_status",
    )
    .eq("tenant_id", user.tenant.id)
    .eq("customer_id", contactId);
  if (!includeSettled) {
    q = q.gt("outstanding_amount", 0);
  }
  const { data } = await q.order("invoice_date", { ascending: false }).limit(200);
  const rows: OpenInvoiceRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    invoice_date: r.invoice_date,
    total_amount: Number(r.total_amount),
    outstanding_amount: Number(r.outstanding_amount ?? 0),
    amount_received: Number(r.amount_received ?? 0),
    settlement_status: String(r.settlement_status ?? "unpaid"),
  }));
  if (process.env.NODE_ENV !== "production") {
    console.log("[listOpenInvoicesForCustomer]", {
      contactId,
      includeSettled: !!includeSettled,
      count: rows.length,
      invoices: rows.map((x) => ({
        id: x.id,
        total: x.total_amount,
        paid: x.amount_received,
        outstanding: x.outstanding_amount,
        status: x.settlement_status,
      })),
    });
  }
  return rows;
}

export async function listOpenBillsForSupplierAction(input: z.infer<typeof ListBillsSchema>) {
  const { contactId, includeSettled } = ListBillsSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) return [];
  const supabase = await createServerSupabaseClient();
  const table = supabase.from("bills") as unknown as {
    select: (cols: string) => {
      eq: (c: string, v: string) => any;
      gt: (c: string, v: number) => any;
      order: (c: string, o: { ascending: boolean }) => any;
      limit: (n: number) => Promise<{ data: any[] | null }>;
    };
  };
  let q = (table as any)
    .select(
      "id, bill_number, bill_date, total_amount, outstanding_amount, amount_paid, settlement_status",
    )
    .eq("tenant_id", user.tenant.id)
    .eq("supplier_id", contactId);
  if (!includeSettled) {
    q = q.gt("outstanding_amount", 0);
  }
  const { data } = await q.order("bill_date", { ascending: false }).limit(200);
  const rows: OpenBillRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    bill_number: r.bill_number,
    bill_date: r.bill_date,
    total_amount: Number(r.total_amount),
    outstanding_amount: Number(r.outstanding_amount ?? 0),
    amount_paid: Number(r.amount_paid ?? 0),
    settlement_status: String(r.settlement_status ?? "unpaid"),
  }));
  if (process.env.NODE_ENV !== "production") {
    console.log("[listOpenBillsForSupplier]", {
      contactId,
      includeSettled: !!includeSettled,
      count: rows.length,
      bills: rows.map((x) => ({
        id: x.id,
        total: x.total_amount,
        paid: x.amount_paid,
        outstanding: x.outstanding_amount,
        status: x.settlement_status,
      })),
    });
  }
  return rows;
}


"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";

const ByContactSchema = z.object({ contactId: z.string().uuid() });

export async function listOpenInvoicesForCustomerAction(input: z.infer<typeof ByContactSchema>) {
  const { contactId } = ByContactSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) return [];
  const supabase = await createServerSupabaseClient();
  // `outstanding_amount` may not be in generated TS types until migrations are applied.
  // Use a cast to keep build green.
  const table = supabase.from("invoices") as unknown as {
    select: (cols: string) => {
      eq: (c: string, v: string) => any;
      gt: (c: string, v: number) => any;
      order: (c: string, o: { ascending: boolean }) => any;
      limit: (n: number) => Promise<{ data: any[] | null }>;
      in?: (c: string, v: string[]) => any;
    };
  };
  const { data } = await (table as any)
    .select("id, invoice_number, invoice_date, total_amount, outstanding_amount")
    .eq("tenant_id", user.tenant.id)
    .eq("customer_id", contactId)
    .gt("outstanding_amount", 0)
    .order("invoice_date", { ascending: false })
    .limit(200);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    invoice_date: r.invoice_date,
    total_amount: Number(r.total_amount),
    outstanding_amount: Number((r as { outstanding_amount?: number }).outstanding_amount ?? 0),
  }));
}

export async function listOpenBillsForSupplierAction(input: z.infer<typeof ByContactSchema>) {
  const { contactId } = ByContactSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) return [];
  const supabase = await createServerSupabaseClient();
  const table = supabase.from("bills") as unknown as {
    select: (cols: string) => {
      eq: (c: string, v: string) => any;
      gt: (c: string, v: number) => any;
      order: (c: string, o: { ascending: boolean }) => any;
      limit: (n: number) => Promise<{ data: any[] | null }>;
      in?: (c: string, v: string[]) => any;
    };
  };
  const { data } = await (table as any)
    .select("id, bill_number, bill_date, total_amount, outstanding_amount")
    .eq("tenant_id", user.tenant.id)
    .eq("supplier_id", contactId)
    .gt("outstanding_amount", 0)
    .order("bill_date", { ascending: false })
    .limit(200);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    bill_number: r.bill_number,
    bill_date: r.bill_date,
    total_amount: Number(r.total_amount),
    outstanding_amount: Number((r as { outstanding_amount?: number }).outstanding_amount ?? 0),
  }));
}


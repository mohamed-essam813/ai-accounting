import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";

export type OpenBillRow = {
  id: string;
  bill_number: string | null;
  bill_date: string;
  due_date: string | null;
  total_amount: number;
  outstanding_amount: number;
  supplier_id: string | null;
  supplier_name: string | null;
};

export type OpenInvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  outstanding_amount: number;
  customer_id: string | null;
  customer_name: string | null;
};

/** Bills with balance due — for supplier payment resolution. */
export async function listOpenBillsForReconciliation(limit = 100): Promise<OpenBillRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("bills")
    .select("id, bill_number, bill_date, due_date, total_amount, outstanding_amount, supplier_id")
    .eq("tenant_id", user.tenant.id)
    .gt("outstanding_amount", 0)
    .order("bill_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listOpenBillsForReconciliation", error);
    return [];
  }

  const rows = data ?? [];
  const supplierIds = [...new Set(rows.map((r) => r.supplier_id).filter(Boolean))] as string[];
  let nameById = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: contacts } = await supabase.from("contacts").select("id, name").in("id", supplierIds);
    nameById = new Map((contacts ?? []).map((c) => [c.id, c.name]));
  }

  return rows.map((row) => ({
    id: row.id,
    bill_number: row.bill_number,
    bill_date: row.bill_date,
    due_date: row.due_date,
    total_amount: Number(row.total_amount),
    outstanding_amount: Number(row.outstanding_amount),
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_id ? nameById.get(row.supplier_id) ?? null : null,
  }));
}

/** Invoices with balance due — for customer payment resolution. */
export async function listOpenInvoicesForReconciliation(limit = 100): Promise<OpenInvoiceRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, due_date, total_amount, outstanding_amount, customer_id")
    .eq("tenant_id", user.tenant.id)
    .gt("outstanding_amount", 0)
    .order("invoice_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listOpenInvoicesForReconciliation", error);
    return [];
  }

  const rows = data ?? [];
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
  let nameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: contacts } = await supabase.from("contacts").select("id, name").in("id", customerIds);
    nameById = new Map((contacts ?? []).map((c) => [c.id, c.name]));
  }

  return rows.map((row) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    invoice_date: row.invoice_date,
    due_date: row.due_date,
    total_amount: Number(row.total_amount),
    outstanding_amount: Number(row.outstanding_amount),
    customer_id: row.customer_id,
    customer_name: row.customer_id ? nameById.get(row.customer_id) ?? null : null,
  }));
}

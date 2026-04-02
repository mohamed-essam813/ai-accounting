import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";
import { dedupeEntitiesForDisplay, normalizeEntityName } from "@/lib/utils/entity-dedupe";
import { accountMatchesContactStatementType } from "@/lib/accounting/ar-ap-subledger";

type ContactsRow = Database["public"]["Tables"]["contacts"]["Row"];

export async function listContacts() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true)
    .order("code");

  if (error) {
    console.error("Failed to load contacts", error);
    throw error;
  }

  const rows = data ?? [];
  return dedupeEntitiesForDisplay(rows as unknown as Record<string, unknown>[], {
    idKey: "id",
    nameKey: "name",
    scopeKey: "type",
    entityLabel: "contacts-table",
  }) as ContactsRow[];
}

/**
 * Find an active contact by normalized display name within tenant + type.
 * Used to prevent duplicate "Apple" vendor rows from separate inserts.
 */
export async function findContactByNormalizedName(
  type: "customer" | "vendor" | "other",
  rawName: string,
): Promise<ContactsRow | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }
  const target = normalizeEntityName(rawName);
  if (!target) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("type", type)
    .eq("is_active", true);

  if (error) {
    console.error("findContactByNormalizedName", error);
    throw error;
  }

  return (data ?? []).find((c) => normalizeEntityName(c.name) === target) ?? null;
}

export async function getContactById(contactId: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load contact", error);
    throw error;
  }

  return data;
}

export async function getContactByCode(code: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("code", code)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load contact", error);
    throw error;
  }

  return data;
}

export type StatementTransaction = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  document_number?: string | null;
  entry_id?: string;
  /** Invoice / bill / receipt / payment context when this journal line is tied to a document. */
  doc_role?: "invoice" | "bill" | "receipt" | "payment" | null;
  doc_total?: number | null;
  doc_paid?: number | null;
  doc_outstanding?: number | null;
  settlement_status?: string | null;
};

export async function getContactStatement(
  contactId: string,
  startDate?: string,
  endDate?: string,
): Promise<StatementTransaction[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const contact = await getContactById(contactId);
  if (!contact) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const tenantId = user.tenant.id;

  const { data: coaRows, error: coaErr } = await supabase
    .from("chart_of_accounts")
    .select("id, code, prd_account_kind")
    .eq("tenant_id", tenantId);

  if (coaErr) {
    console.error("[statement-of-account] chart_of_accounts load failed", coaErr);
    throw coaErr;
  }

  const subledgerAccounts = (coaRows ?? []).filter((a) =>
    accountMatchesContactStatementType(contact.type as "customer" | "vendor" | "other", a),
  );
  const accountIds = subledgerAccounts.map((a) => a.id);
  const coaById = new Map(subledgerAccounts.map((a) => [a.id, a]));

  if (accountIds.length === 0) {
    console.warn("[statement-of-account] No AR/AP accounts for tenant subledger.", { tenantId, contactId });
    return [];
  }

  const { data: rawLines, error: linesErr } = await supabase
    .from("journal_lines")
    .select("id, entry_id, account_id, debit, credit, memo")
    .eq("contact_id", contactId)
    .in("account_id", accountIds);

  if (linesErr) {
    console.error("[statement-of-account] journal_lines query failed", linesErr);
    throw linesErr;
  }

  const lines = rawLines ?? [];
  console.log("[statement-of-account] Subledger lines for contact", {
    contactId,
    tenantId,
    matchingJournalLines: lines.length,
  });

  if (lines.length === 0) {
    console.warn(
      "[statement-of-account] No entries linked to this contact (need contact_id on AR/AP journal lines).",
      { contactId, tenantId },
    );
    return [];
  }

  const entryIdSet = new Set(lines.map((l) => l.entry_id));

  let entriesQuery = supabase
    .from("journal_entries")
    .select("id, date, description")
    .eq("tenant_id", tenantId)
    .eq("status", "posted")
    .in("id", [...entryIdSet])
    .order("date", { ascending: true });

  if (startDate) {
    entriesQuery = entriesQuery.gte("date", startDate);
  }
  if (endDate) {
    entriesQuery = entriesQuery.lte("date", endDate);
  }

  const { data: entries, error: entErr } = await entriesQuery;
  if (entErr) {
    console.error("[statement-of-account] journal_entries query failed", entErr);
    throw entErr;
  }

  const entryList = (entries ?? []).slice().sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
  const entryIdInRange = new Set(entryList.map((e) => e.id));
  const entryIdsList = [...entryIdInRange];

  type InvRow = {
    journal_entry_id: string;
    invoice_number: string | null;
    total_amount: number;
    amount_received: number;
    outstanding_amount: number;
    settlement_status: string;
  };
  type BillRow = {
    journal_entry_id: string;
    bill_number: string | null;
    total_amount: number;
    amount_paid: number;
    outstanding_amount: number;
    settlement_status: string;
  };
  type PayRow = {
    journal_entry_id: string;
    voucher_number: string | null;
    payment_type: string;
    amount: number;
    payment_date: string;
  };

  const invoiceByJe = new Map<string, InvRow>();
  const billByJe = new Map<string, BillRow>();
  const paymentByJe = new Map<string, PayRow>();

  if (entryIdsList.length > 0) {
    if (contact.type === "customer") {
      const { data: invs } = await supabase
        .from("invoices")
        .select(
          "journal_entry_id, invoice_number, total_amount, amount_received, outstanding_amount, settlement_status",
        )
        .eq("tenant_id", tenantId)
        .eq("customer_id", contactId)
        .in("journal_entry_id", entryIdsList);
      (invs ?? []).forEach((row) => {
        const r = row as InvRow;
        invoiceByJe.set(r.journal_entry_id, r);
      });
    }
    if (contact.type === "vendor") {
      const { data: bills } = await supabase
        .from("bills")
        .select(
          "journal_entry_id, bill_number, total_amount, amount_paid, outstanding_amount, settlement_status",
        )
        .eq("tenant_id", tenantId)
        .eq("supplier_id", contactId)
        .in("journal_entry_id", entryIdsList);
      (bills ?? []).forEach((row) => {
        const r = row as BillRow;
        billByJe.set(r.journal_entry_id, r);
      });
    }
    const { data: pays } = await supabase
      .from("payments")
      .select("journal_entry_id, voucher_number, payment_type, amount, payment_date")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId)
      .in("journal_entry_id", entryIdsList);
    (pays ?? []).forEach((row) => {
      const r = row as PayRow;
      if (!paymentByJe.has(r.journal_entry_id)) paymentByJe.set(r.journal_entry_id, r);
    });
  }

  const { data: draftRows } = await supabase
    .from("drafts")
    .select("posted_entry_id, data_json")
    .eq("tenant_id", tenantId)
    .in("posted_entry_id", [...entryIdInRange]);

  const docNumByEntry = new Map<string, string | null>();
  (draftRows ?? []).forEach((d) => {
    if (!d.posted_entry_id) return;
    const dj = d.data_json as { invoice_number?: string | null; bill_number?: string | null };
    docNumByEntry.set(d.posted_entry_id, dj.invoice_number ?? dj.bill_number ?? null);
  });

  const transactions: StatementTransaction[] = [];
  let runningBalance = 0;

  const isArAccount = (accountId: string) => {
    const a = coaById.get(accountId);
    if (!a) return true;
    return a.prd_account_kind === "accounts_receivable" || a.code === "1100";
  };

  for (const entry of entryList) {
    const entryLines = lines.filter((l) => l.entry_id === entry.id && entryIdInRange.has(l.entry_id));
    let totalDebit = 0;
    let totalCredit = 0;
    let delta = 0;
    for (const l of entryLines) {
      const dr = Number(l.debit ?? 0);
      const cr = Number(l.credit ?? 0);
      totalDebit += dr;
      totalCredit += cr;
      if (contact.type === "customer") {
        delta += dr - cr;
      } else if (contact.type === "vendor") {
        delta += cr - dr;
      } else {
        delta += isArAccount(l.account_id) ? dr - cr : cr - dr;
      }
    }
    runningBalance += delta;

    const inv = invoiceByJe.get(entry.id);
    const bill = billByJe.get(entry.id);
    const pay = paymentByJe.get(entry.id);

    let docMeta: Partial<StatementTransaction> = {};
    if (inv) {
      docMeta = {
        doc_role: "invoice",
        doc_total: Number(inv.total_amount),
        doc_paid: Number(inv.amount_received),
        doc_outstanding: Number(inv.outstanding_amount),
        settlement_status: inv.settlement_status,
        document_number: inv.invoice_number ?? docNumByEntry.get(entry.id) ?? null,
      };
    } else if (bill) {
      docMeta = {
        doc_role: "bill",
        doc_total: Number(bill.total_amount),
        doc_paid: Number(bill.amount_paid),
        doc_outstanding: Number(bill.outstanding_amount),
        settlement_status: bill.settlement_status,
        document_number: bill.bill_number ?? docNumByEntry.get(entry.id) ?? null,
      };
    } else if (pay) {
      const isReceipt = pay.payment_type === "receipt";
      docMeta = {
        doc_role: isReceipt ? "receipt" : "payment",
        doc_total: Number(pay.amount),
        doc_paid: Number(pay.amount),
        doc_outstanding: 0,
        settlement_status: "paid",
        document_number: pay.voucher_number ?? docNumByEntry.get(entry.id) ?? null,
      };
    }

    transactions.push({
      date: entry.date,
      description: entry.description,
      debit: totalDebit,
      credit: totalCredit,
      balance: runningBalance,
      document_number: docMeta.document_number ?? docNumByEntry.get(entry.id) ?? null,
      entry_id: entry.id,
      ...docMeta,
    });
  }

  console.log("[statement-of-account] Statement rows", {
    contactId,
    entriesInDateRange: transactions.length,
  });

  return transactions;
}

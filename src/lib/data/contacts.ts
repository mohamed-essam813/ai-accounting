import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "../database.types";
import { normalizeEntityName } from "@/lib/utils/entity-dedupe";
import { accountMatchesContactStatementRoles } from "@/lib/accounting/ar-ap-subledger";
import { similarityBand, similarityRatio } from "@/lib/contacts/string-similarity";

export type ContactsRow = Database["public"]["Tables"]["contacts"]["Row"];

export type ContactListFilter = "all" | "customers" | "vendors" | "employees" | "deactivated";

export type ContactListSort =
  | "name_asc"
  | "name_desc"
  | "code_asc"
  | "code_desc"
  | "outstanding_desc"
  | "last_activity_desc"
  | "created_desc";

export type ContactListRow = ContactsRow & {
  outstanding_ar: number;
  outstanding_ap: number;
  last_activity_at: string | null;
};

export async function listContactsForPicker(options?: { kind?: "customer" | "vendor" }) {
  const rows = await listContactsRaw({ activeOnly: true });
  const kind = options?.kind;
  return rows.filter((c) => {
    if (kind === "customer") return c.is_customer;
    if (kind === "vendor") return c.is_vendor;
    return true;
  });
}

/** Raw list without deduplication (pickers need every logical row). */
async function listContactsRaw(opts: { activeOnly?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  let q = supabase.from("contacts").select("*").eq("tenant_id", user.tenant.id);
  if (opts.activeOnly) {
    q = q.eq("is_active", true);
  }
  const { data, error } = await q.order("code");
  if (error) throw error;
  return (data ?? []) as ContactsRow[];
}

export async function listContacts(options?: {
  filter?: ContactListFilter;
  search?: string;
  sort?: ContactListSort;
  includeInactive?: boolean;
}): Promise<ContactListRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const tenantId = user.tenant.id;
  const filter = options?.filter ?? "all";
  const search = (options?.search ?? "").trim().toLowerCase();
  const includeInactive = options?.includeInactive ?? filter === "deactivated";

  let q = supabase.from("contacts").select("*").eq("tenant_id", tenantId);

  if (filter === "deactivated") {
    q = q.eq("is_active", false);
  } else if (!includeInactive) {
    q = q.eq("is_active", true);
  }

  if (filter === "customers") q = q.eq("is_customer", true);
  if (filter === "vendors") q = q.eq("is_vendor", true);
  if (filter === "employees") q = q.eq("is_employee", true);

  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as ContactsRow[];

  if (search) {
    rows = rows.filter((c) => {
      const hay = [
        c.name,
        c.code,
        c.email,
        c.phone,
        c.trn,
        c.city,
        c.emirate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(search);
    });
  }

  const ids = rows.map((r) => r.id);
  const [balances, lastActivity] = await Promise.all([
    getOutstandingBalancesByContactIds(tenantId, ids),
    getLastActivityByContactIds(tenantId, ids),
  ]);

  const enriched: ContactListRow[] = rows.map((c) => ({
    ...c,
    outstanding_ar: balances.get(c.id)?.ar ?? 0,
    outstanding_ap: balances.get(c.id)?.ap ?? 0,
    last_activity_at: lastActivity.get(c.id) ?? null,
  }));

  const sort = options?.sort ?? "name_asc";
  enriched.sort((a, b) => {
    switch (sort) {
      case "name_desc":
        return b.name.localeCompare(a.name);
      case "code_asc":
        return a.code.localeCompare(b.code);
      case "code_desc":
        return b.code.localeCompare(a.code);
      case "outstanding_desc": {
        const ta = a.outstanding_ar + a.outstanding_ap;
        const tb = b.outstanding_ar + b.outstanding_ap;
        return tb - ta;
      }
      case "last_activity_desc": {
        const da = a.last_activity_at ?? "";
        const db = b.last_activity_at ?? "";
        return db.localeCompare(da);
      }
      case "created_desc":
        return b.created_at.localeCompare(a.created_at);
      case "name_asc":
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return enriched;
}

async function getOutstandingBalancesByContactIds(
  tenantId: string,
  contactIds: string[],
): Promise<Map<string, { ar: number; ap: number }>> {
  const map = new Map<string, { ar: number; ap: number }>();
  for (const id of contactIds) map.set(id, { ar: 0, ap: 0 });
  if (contactIds.length === 0) return map;

  const supabase = await createServerSupabaseClient();

  const { data: inv } = await supabase
    .from("invoices")
    .select("customer_id, outstanding_amount")
    .eq("tenant_id", tenantId)
    .in("customer_id", contactIds);
  for (const row of inv ?? []) {
    const id = (row as { customer_id: string }).customer_id;
    const o = Number((row as { outstanding_amount: number }).outstanding_amount) || 0;
    const cur = map.get(id) ?? { ar: 0, ap: 0 };
    cur.ar += o;
    map.set(id, cur);
  }

  const { data: bills } = await supabase
    .from("bills")
    .select("supplier_id, outstanding_amount")
    .eq("tenant_id", tenantId)
    .in("supplier_id", contactIds);
  for (const row of bills ?? []) {
    const id = (row as { supplier_id: string }).supplier_id;
    const o = Number((row as { outstanding_amount: number }).outstanding_amount) || 0;
    const cur = map.get(id) ?? { ar: 0, ap: 0 };
    cur.ap += o;
    map.set(id, cur);
  }

  return map;
}

async function getLastActivityByContactIds(
  tenantId: string,
  contactIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (contactIds.length === 0) return map;

  const supabase = await createServerSupabaseClient();
  const { data: je } = await supabase
    .from("journal_entries")
    .select("contact_id, date")
    .eq("tenant_id", tenantId)
    .in("contact_id", contactIds)
    .eq("status", "posted")
    .order("date", { ascending: false });

  for (const row of je ?? []) {
    const cid = (row as { contact_id: string | null }).contact_id;
    const d = (row as { date: string }).date;
    if (cid && !map.has(cid)) map.set(cid, d);
  }
  return map;
}

export async function getContactOutstandingTotal(contactId: string): Promise<{
  ar: number;
  ap: number;
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) return { ar: 0, ap: 0 };
  const m = await getOutstandingBalancesByContactIds(user.tenant.id, [contactId]);
  return m.get(contactId) ?? { ar: 0, ap: 0 };
}

/**
 * Find active contact by normalized name, optionally requiring a role.
 */
export async function findContactByNormalizedName(
  role: "customer" | "vendor" | "employee" | "any",
  rawName: string,
): Promise<ContactsRow | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) return null;
  const target = normalizeEntityName(rawName);
  if (!target) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true);

  if (error) throw error;

  return (
    (data ?? []).find((c) => {
      const row = c as ContactsRow;
      if (normalizeEntityName(row.name) !== target) return false;
      if (role === "any") return true;
      if (role === "customer") return row.is_customer;
      if (role === "vendor") return row.is_vendor;
      if (role === "employee") return row.is_employee;
      return false;
    }) ?? null
  );
}

export type DuplicateMatch = {
  contact: ContactsRow;
  ratio: number;
  band: ReturnType<typeof similarityBand>;
  reasons: string[];
};

/**
 * Fuzzy + exact duplicate candidates for create/edit (excluding self).
 */
export async function findDuplicateCandidates(
  input: {
    name: string;
    email?: string | null;
    phone?: string | null;
    trn?: string | null;
    excludeId?: string;
  },
  limit = 5,
): Promise<DuplicateMatch[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true);

  if (error) throw error;

  const rows = (data ?? []) as ContactsRow[];
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = (input.phone ?? "").replace(/\s/g, "");
  const trn = (input.trn ?? "").replace(/\D/g, "");

  const scored: DuplicateMatch[] = [];

  for (const c of rows) {
    if (input.excludeId && c.id === input.excludeId) continue;

    const reasons: string[] = [];
    let ratio = 0;

    const r = similarityRatio(input.name, c.name);
    if (r >= 0.85) {
      reasons.push("name similarity");
      ratio = Math.max(ratio, r);
    }

    if (email && c.email && email === c.email.trim().toLowerCase()) {
      reasons.push("email");
      ratio = Math.max(ratio, 1);
    }
    if (phone && c.phone && phone === c.phone.replace(/\s/g, "")) {
      reasons.push("phone");
      ratio = Math.max(ratio, 1);
    }
    if (trn && c.trn && trn === c.trn.replace(/\D/g, "") && trn.length >= 5) {
      reasons.push("TRN");
      ratio = Math.max(ratio, 1);
    }

    if (reasons.length === 0) continue;

    scored.push({
      contact: c,
      ratio,
      band: similarityBand(ratio),
      reasons,
    });
  }

  scored.sort((a, b) => b.ratio - a.ratio);
  return scored.slice(0, limit);
}

export async function findDuplicatePairsForAdmin(): Promise<
  { a: ContactsRow; b: ContactsRow; ratio: number }[]
> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true);

  if (error) throw error;
  const rows = (data ?? []) as ContactsRow[];
  const pairs: { a: ContactsRow; b: ContactsRow; ratio: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const r = similarityRatio(rows[i]!.name, rows[j]!.name);
      if (r >= 0.85) {
        pairs.push({ a: rows[i]!, b: rows[j]!, ratio: r });
      }
    }
  }
  pairs.sort((x, y) => y.ratio - x.ratio);
  return pairs;
}

export async function getContactTransactionCounts(contactId: string): Promise<{
  invoices: number;
  bills: number;
  payments: number;
  journals: number;
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return { invoices: 0, bills: 0, payments: 0, journals: 0 };
  }
  const supabase = await createServerSupabaseClient();
  const tenantId = user.tenant.id;

  const [{ count: invc }, { count: bc }, { count: pc }, { count: jc }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("customer_id", contactId),
    supabase
      .from("bills")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("supplier_id", contactId),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId),
    supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId),
  ]);

  return {
    invoices: invc ?? 0,
    bills: bc ?? 0,
    payments: pc ?? 0,
    journals: jc ?? 0,
  };
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

  return data as ContactsRow | null;
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

  return data as ContactsRow | null;
}

export type StatementTransaction = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  document_number?: string | null;
  entry_id?: string;
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
    accountMatchesContactStatementRoles(
      { is_customer: contact.is_customer, is_vendor: contact.is_vendor },
      a,
    ),
  );
  const accountIds = subledgerAccounts.map((a) => a.id);
  const coaById = new Map(subledgerAccounts.map((a) => [a.id, a]));

  if (accountIds.length === 0) {
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

  if (lines.length === 0) {
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
    if (contact.is_customer) {
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
    if (contact.is_vendor) {
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
      const acc = coaById.get(l.account_id);
      const isAr = acc && (acc.prd_account_kind === "accounts_receivable" || acc.code === "1100");
      const isAp = acc && (acc.prd_account_kind === "accounts_payable" || acc.code === "2000");
      if (isAr && contact.is_customer) {
        delta += dr - cr;
      } else if (isAp && contact.is_vendor) {
        delta += cr - dr;
      } else if (contact.is_customer && !contact.is_vendor) {
        delta += isArAccount(l.account_id) ? dr - cr : cr - dr;
      } else if (!contact.is_customer && contact.is_vendor) {
        delta += cr - dr;
      } else {
        if (isAr) delta += dr - cr;
        else if (isAp) delta += cr - dr;
        else delta += isArAccount(l.account_id) ? dr - cr : cr - dr;
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

  return transactions;
}

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import type { Database } from "@/lib/database.types";
import { getAveragePostedTransactionAmount90d } from "@/lib/data/document-lists/avg-transaction-90d";
import type { DocumentStatusFilter, PaymentListQuery } from "@/lib/data/document-lists/types";

type DraftsRow = Database["public"]["Tables"]["drafts"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

export type PaymentListRow = {
  rowKey: string;
  source: "draft" | "posted";
  id: string;
  draftId: string | null;
  paymentDate: string;
  direction: "in" | "out";
  contactId: string | null;
  contactName: string | null;
  contactCode: string | null;
  contactTrn: string | null;
  description: string | null;
  amount: number;
  currencyCode: string | null;
  bankAccountId: string | null;
  bankAccountLabel: string | null;
  reference: string | null;
  voucherNumber: string | null;
  workflowStatus: "draft" | "approved" | "pending_approval" | "posted" | "voided" | "reversed";
  journalEntryId: string | null;
  journalStatus: string | null;
  paymentType: string | null;
  createdBy: string | null;
};

function draftPaymentDate(d: DraftsRow): string {
  const dj = d.data_json as Record<string, unknown> | null;
  const entities = (dj?.entities as Record<string, unknown>) || {};
  const date = (entities.date as string) || (d.created_at as string).slice(0, 10);
  return date.slice(0, 10);
}

function draftAmount(d: DraftsRow): number {
  const dj = d.data_json as Record<string, unknown> | null;
  const entities = (dj?.entities as Record<string, unknown>) || {};
  const a = entities.amount;
  return typeof a === "number" ? Math.abs(a) : 0;
}

function draftDescription(d: DraftsRow): string | null {
  const dj = d.data_json as Record<string, unknown> | null;
  const entities = (dj?.entities as Record<string, unknown>) || {};
  const desc = entities.description as string | undefined;
  return desc?.trim() || null;
}

function mapDraftWorkflow(d: DraftsRow): PaymentListRow["workflowStatus"] {
  if (d.status === "void") return "voided";
  if (d.status === "approved") return "approved";
  if (d.status === "draft") return "draft";
  return "draft";
}

function mapPostedWorkflow(jeStatus: string | null): PaymentListRow["workflowStatus"] {
  if (jeStatus === "void") return "voided";
  return "posted";
}

function rowMatchesStatus(row: PaymentListRow, filter: DocumentStatusFilter): boolean {
  if (filter === "all") {
    return row.workflowStatus !== "voided" && row.workflowStatus !== "reversed";
  }
  if (filter === "pending_approval") return row.workflowStatus === "pending_approval";
  if (filter === "draft") return row.workflowStatus === "draft";
  if (filter === "approved") return row.workflowStatus === "approved";
  if (filter === "posted") return row.workflowStatus === "posted";
  if (filter === "voided") return row.workflowStatus === "voided";
  if (filter === "reversed") return row.workflowStatus === "reversed";
  return true;
}

function rowMatchesSearch(row: PaymentListRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  if ((row.voucherNumber || "").toLowerCase().includes(q)) return true;
  if ((row.contactName || "").toLowerCase().includes(q)) return true;
  if ((row.reference || "").toLowerCase().includes(q)) return true;
  if ((row.description || "").toLowerCase().includes(q)) return true;
  if ((row.bankAccountLabel || "").toLowerCase().includes(q)) return true;
  const numeric = q.replace(/[^0-9.-]/g, "");
  if (numeric) {
    const v = parseFloat(numeric);
    if (!Number.isNaN(v) && Math.abs(row.amount - v) < 0.01) return true;
  }
  return false;
}

function sortPaymentRows(rows: PaymentListRow[], sort: PaymentListQuery["sort"], dir: PaymentListQuery["sortDir"]): void {
  const mult = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sort === "amount") return (a.amount - b.amount) * mult;
    return a.paymentDate.localeCompare(b.paymentDate) * mult;
  });
}

export async function queryPaymentsList(params: PaymentListQuery): Promise<{
  rows: PaymentListRow[];
  total: number;
  summary: { totalIn: number; totalOut: number; net: number; count: number };
  avg90: number | null;
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      rows: [],
      total: 0,
      summary: { totalIn: 0, totalOut: 0, net: 0, count: 0 },
      avg90: null,
    };
  }

  const tenantId = user.tenant.id;
  const supabase = await createServerSupabaseClient();
  const avg90 = await getAveragePostedTransactionAmount90d(tenantId);

  const { data: draftData, error: draftErr } = await supabase
    .from("drafts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("intent", "record_payment")
    .neq("status", "posted")
    .order("created_at", { ascending: false })
    .limit(3000);

  if (draftErr) console.error("queryPaymentsList drafts", draftErr);

  const { data: payData, error: payErr } = await supabase.from("payments").select("*").eq("tenant_id", tenantId);

  if (payErr) console.error("queryPaymentsList payments", payErr);

  const drafts = (draftData ?? []) as DraftsRow[];
  const payments = (payData ?? []) as PaymentRow[];

  const jeIds = [...new Set(payments.map((p) => p.journal_entry_id))];
  let jeById = new Map<string, { status: string; created_by: string; description: string }>();
  if (jeIds.length > 0) {
    const { data: jes } = await supabase
      .from("journal_entries")
      .select("id, status, created_by, description")
      .eq("tenant_id", tenantId)
      .in("id", jeIds);
    jeById = new Map(
      (jes ?? []).map((j) => [
        j.id,
        { status: j.status, created_by: j.created_by, description: j.description },
      ]),
    );
  }

  const bankIds = [...new Set(payments.map((p) => p.bank_account_id).filter(Boolean))] as string[];
  let accountById = new Map<string, string>();
  if (bankIds.length > 0) {
    const { data: accs } = await supabase
      .from("chart_of_accounts")
      .select("id, code, name")
      .eq("tenant_id", tenantId)
      .in("id", bankIds);
    accountById = new Map(
      (accs ?? []).map((a) => [a.id, `${a.code} ${a.name}`.trim()]),
    );
  }

  const contactIds = [
    ...new Set([
      ...drafts.map((d) => d.contact_id).filter(Boolean),
      ...payments.map((p) => p.contact_id).filter(Boolean),
    ]),
  ] as string[];

  let contactById = new Map<string, { name: string; code: string; trn: string | null }>();
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, code, trn")
      .eq("tenant_id", tenantId)
      .in("id", contactIds);
    contactById = new Map(
      (contacts ?? []).map((c) => [c.id, { name: c.name, code: c.code, trn: c.trn }]),
    );
  }

  const rows: PaymentListRow[] = [];

  for (const d of drafts) {
    const paymentDate = draftPaymentDate(d);
    const amt = draftAmount(d);
    const cid = d.contact_id;
    const c = cid ? contactById.get(cid) : undefined;
    const wf = mapDraftWorkflow(d);
    const dirGuess: "in" | "out" =
      ((d.data_json as Record<string, unknown>)?.entities as Record<string, unknown>)?.payment_direction === "out"
        ? "out"
        : "in";

    rows.push({
      rowKey: `draft:${d.id}`,
      source: "draft",
      id: d.id,
      draftId: d.id,
      paymentDate,
      direction: dirGuess,
      contactId: cid,
      contactName: c?.name ?? null,
      contactCode: c?.code ?? null,
      contactTrn: c?.trn ?? null,
      description: draftDescription(d),
      amount: amt,
      currencyCode:
        ((d.data_json as Record<string, unknown>)?.entities as Record<string, unknown>)?.currency?.toString() ?? null,
      bankAccountId: null,
      bankAccountLabel: null,
      reference:
        ((d.data_json as Record<string, unknown>)?.entities as Record<string, unknown>)?.reference?.toString() ?? null,
      voucherNumber: null,
      workflowStatus: wf,
      journalEntryId: null,
      journalStatus: null,
      paymentType: null,
      createdBy: d.created_by,
    });
  }

  for (const p of payments) {
    const je = jeById.get(p.journal_entry_id);
    const wf = mapPostedWorkflow(je?.status ?? null);
    const cid = p.contact_id;
    const c = cid ? contactById.get(cid) : undefined;
    const direction: "in" | "out" = p.payment_type === "payment" ? "out" : "in";

    rows.push({
      rowKey: `posted:${p.id}`,
      source: "posted",
      id: p.id,
      draftId: p.draft_id,
      paymentDate: p.payment_date.slice(0, 10),
      direction,
      contactId: cid,
      contactName: c?.name ?? null,
      contactCode: c?.code ?? null,
      contactTrn: c?.trn ?? null,
      description: je?.description ?? null,
      amount: Number(p.amount),
      currencyCode: p.currency_code,
      bankAccountId: p.bank_account_id,
      bankAccountLabel: p.bank_account_id ? accountById.get(p.bank_account_id) ?? null : null,
      reference: p.reference,
      voucherNumber: p.voucher_number,
      workflowStatus: wf,
      journalEntryId: p.journal_entry_id,
      journalStatus: je?.status ?? null,
      paymentType: p.payment_type,
      createdBy: je?.created_by ?? null,
    });
  }

  let filtered = rows.filter((r) => {
    if (r.paymentDate < params.startDate || r.paymentDate > params.endDate) return false;
    if (!rowMatchesStatus(r, params.status)) return false;
    if (params.counterpartyIds.length > 0) {
      if (!r.contactId || !params.counterpartyIds.includes(r.contactId)) return false;
    }
    if (params.amountMin != null && r.amount < params.amountMin) return false;
    if (params.amountMax != null && r.amount > params.amountMax) return false;
    if (params.createdBy && r.createdBy !== params.createdBy) return false;
    if (params.direction === "in" && r.direction !== "in") return false;
    if (params.direction === "out" && r.direction !== "out") return false;
    if (!rowMatchesSearch(r, params.search)) return false;
    return true;
  });

  const summary = {
    totalIn: filtered.filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0),
    totalOut: filtered.filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0),
    net: 0,
    count: filtered.length,
  };
  summary.net = summary.totalIn - summary.totalOut;

  sortPaymentRows(filtered, params.sort, params.sortDir);

  const total = filtered.length;
  const start = (params.page - 1) * params.pageSize;
  filtered = filtered.slice(start, start + params.pageSize);

  return { rows: filtered, total, summary, avg90 };
}

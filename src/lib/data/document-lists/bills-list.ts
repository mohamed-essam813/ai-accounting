import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import type { Database } from "@/lib/database.types";
import { getAveragePostedTransactionAmount90d } from "@/lib/data/document-lists/avg-transaction-90d";
import type { BillListQuery, DocumentStatusFilter } from "@/lib/data/document-lists/types";

type DraftsRow = Database["public"]["Tables"]["drafts"]["Row"];
type BillRow = Database["public"]["Tables"]["bills"]["Row"];

export type BillListRow = {
  rowKey: string;
  source: "draft" | "posted";
  id: string;
  draftId: string | null;
  billNumber: string | null;
  documentDate: string;
  dueDate: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorCode: string | null;
  vendorTrn: string | null;
  description: string | null;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  currencyCode: string | null;
  settlementStatus: string | null;
  workflowStatus: "draft" | "approved" | "pending_approval" | "posted" | "voided" | "reversed";
  journalEntryId: string | null;
  journalStatus: string | null;
  isOverdue: boolean;
  createdBy: string | null;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function draftDocumentDate(d: DraftsRow): string {
  const dj = d.data_json as Record<string, unknown> | null;
  const entities = (dj?.entities as Record<string, unknown>) || {};
  const date = (entities.date as string) || (d.created_at as string).slice(0, 10);
  return date.slice(0, 10);
}

function draftTotal(d: DraftsRow): number {
  const dj = d.data_json as Record<string, unknown> | null;
  const entities = (dj?.entities as Record<string, unknown>) || {};
  const tx = dj?.transaction_amounts as { total_amount?: number } | undefined;
  if (tx && typeof tx.total_amount === "number") return Math.abs(tx.total_amount);
  const a = entities.amount;
  return typeof a === "number" ? Math.abs(a) : 0;
}

function draftDescription(d: DraftsRow): string | null {
  const dj = d.data_json as Record<string, unknown> | null;
  const entities = (dj?.entities as Record<string, unknown>) || {};
  const desc = entities.description as string | undefined;
  return desc?.trim() || null;
}

function draftBillNumber(d: DraftsRow): string | null {
  const dj = d.data_json as Record<string, unknown> | null;
  const entities = (dj?.entities as Record<string, unknown>) || {};
  const n = entities.bill_number as string | undefined;
  return n?.trim() || null;
}

function mapDraftWorkflow(d: DraftsRow): BillListRow["workflowStatus"] {
  if (d.status === "void") return "voided";
  if (d.status === "approved") return "approved";
  if (d.status === "draft") return "draft";
  return "draft";
}

function mapPostedWorkflow(b: BillRow, jeStatus: string | null): BillListRow["workflowStatus"] {
  const st = (b.status || "").toLowerCase();
  if (st === "reversed") return "reversed";
  if (jeStatus === "void") return "voided";
  return "posted";
}

function rowMatchesStatus(row: BillListRow, filter: DocumentStatusFilter): boolean {
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

function rowMatchesSearch(row: BillListRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  if ((row.billNumber || "").toLowerCase().includes(q)) return true;
  if ((row.vendorName || "").toLowerCase().includes(q)) return true;
  if ((row.description || "").toLowerCase().includes(q)) return true;
  const numeric = q.replace(/[^0-9.-]/g, "");
  if (numeric) {
    const v = parseFloat(numeric);
    if (!Number.isNaN(v) && Math.abs(row.totalAmount - v) < 0.01) return true;
  }
  return false;
}

function sortRows(rows: BillListRow[], sort: BillListQuery["sort"], dir: BillListQuery["sortDir"]): void {
  const mult = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sort === "total") return (a.totalAmount - b.totalAmount) * mult;
    if (sort === "number") {
      const an = a.billNumber || "";
      const bn = b.billNumber || "";
      return an.localeCompare(bn) * mult;
    }
    return a.documentDate.localeCompare(b.documentDate) * mult;
  });
}

export async function queryBillsList(params: BillListQuery): Promise<{
  rows: BillListRow[];
  total: number;
  summary: { totalBilled: number; totalPaid: number; totalOutstanding: number; count: number };
  avg90: number | null;
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      rows: [],
      total: 0,
      summary: { totalBilled: 0, totalPaid: 0, totalOutstanding: 0, count: 0 },
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
    .eq("intent", "create_bill")
    .neq("status", "posted")
    .order("created_at", { ascending: false })
    .limit(3000);

  if (draftErr) console.error("queryBillsList drafts", draftErr);

  const { data: billData, error: billErr } = await supabase.from("bills").select("*").eq("tenant_id", tenantId);

  if (billErr) console.error("queryBillsList bills", billErr);

  const drafts = (draftData ?? []) as DraftsRow[];
  const bills = (billData ?? []) as BillRow[];

  const jeIds = [...new Set(bills.map((b) => b.journal_entry_id))];
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

  const contactIds = [
    ...new Set([
      ...drafts.map((d) => d.contact_id).filter(Boolean),
      ...bills.map((b) => b.supplier_id).filter(Boolean),
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

  const today = isoDate(new Date());
  const rows: BillListRow[] = [];

  for (const d of drafts) {
    const documentDate = draftDocumentDate(d);
    const total = draftTotal(d);
    const cid = d.contact_id;
    const c = cid ? contactById.get(cid) : undefined;
    const wf = mapDraftWorkflow(d);

    rows.push({
      rowKey: `draft:${d.id}`,
      source: "draft",
      id: d.id,
      draftId: d.id,
      billNumber: draftBillNumber(d),
      documentDate,
      dueDate: ((d.data_json as Record<string, unknown>)?.entities as Record<string, unknown>)?.due_date
        ? String(((d.data_json as Record<string, unknown>).entities as Record<string, unknown>).due_date).slice(0, 10)
        : null,
      vendorId: cid,
      vendorName: c?.name ?? null,
      vendorCode: c?.code ?? null,
      vendorTrn: c?.trn ?? null,
      description: draftDescription(d),
      totalAmount: total,
      paidAmount: 0,
      outstandingAmount: total,
      currencyCode:
        ((d.data_json as Record<string, unknown>)?.entities as Record<string, unknown>)?.currency?.toString() ?? null,
      settlementStatus: "unpaid",
      workflowStatus: wf,
      journalEntryId: null,
      journalStatus: null,
      isOverdue: false,
      createdBy: d.created_by,
    });
  }

  for (const bill of bills) {
    const je = jeById.get(bill.journal_entry_id);
    const wf = mapPostedWorkflow(bill, je?.status ?? null);
    const cid = bill.supplier_id;
    const c = cid ? contactById.get(cid) : undefined;
    const outstanding = Number(bill.outstanding_amount);
    const settlement = bill.settlement_status || "";
    const due = bill.due_date ? bill.due_date.slice(0, 10) : null;
    const isOverdue = wf === "posted" && settlement !== "paid" && !!due && due < today;

    rows.push({
      rowKey: `posted:${bill.id}`,
      source: "posted",
      id: bill.id,
      draftId: bill.draft_id,
      billNumber: bill.bill_number,
      documentDate: bill.bill_date.slice(0, 10),
      dueDate: due,
      vendorId: cid,
      vendorName: c?.name ?? null,
      vendorCode: c?.code ?? null,
      vendorTrn: c?.trn ?? null,
      description: je?.description ?? null,
      totalAmount: Number(bill.total_amount),
      paidAmount: Number(bill.amount_paid),
      outstandingAmount: outstanding,
      currencyCode: bill.currency_code,
      settlementStatus: bill.settlement_status,
      workflowStatus: wf,
      journalEntryId: bill.journal_entry_id,
      journalStatus: je?.status ?? null,
      isOverdue,
      createdBy: je?.created_by ?? null,
    });
  }

  let filtered = rows.filter((r) => {
    if (r.documentDate < params.startDate || r.documentDate > params.endDate) return false;
    if (!rowMatchesStatus(r, params.status)) return false;
    if (params.counterpartyIds.length > 0) {
      if (!r.vendorId || !params.counterpartyIds.includes(r.vendorId)) return false;
    }
    if (params.amountMin != null && r.totalAmount < params.amountMin) return false;
    if (params.amountMax != null && r.totalAmount > params.amountMax) return false;
    if (params.createdBy && r.createdBy !== params.createdBy) return false;
    if (params.overdue === "yes" && !r.isOverdue) return false;
    if (params.overdue === "no" && r.isOverdue) return false;
    if (params.hasBillNumber === "yes" && !r.billNumber) return false;
    if (params.hasBillNumber === "no" && !!r.billNumber) return false;
    if (!rowMatchesSearch(r, params.search)) return false;
    return true;
  });

  const summary = {
    totalBilled: filtered.reduce((s, r) => s + r.totalAmount, 0),
    totalPaid: filtered.reduce((s, r) => s + r.paidAmount, 0),
    totalOutstanding: filtered.reduce((s, r) => s + r.outstandingAmount, 0),
    count: filtered.length,
  };

  sortRows(filtered, params.sort, params.sortDir);

  const total = filtered.length;
  const start = (params.page - 1) * params.pageSize;
  filtered = filtered.slice(start, start + params.pageSize);

  return { rows: filtered, total, summary, avg90 };
}

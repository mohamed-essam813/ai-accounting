/**
 * Read-only data integrity reports (no mutations). Used by /admin/data-integrity.
 */

/** Posted `journal_lines` rows do not store a denormalized account name; names come from `chart_of_accounts` via joins. */
export type JournalLineNameRepairReport = {
  mismatchCount: number;
  samples: Array<{ journal_line_id: string; account_id: string; note: string }>;
  note: string;
};

export function reportJournalLineAccountNameVsCoaRepair(): JournalLineNameRepairReport {
  return {
    mismatchCount: 0,
    samples: [],
    note:
      "PostgreSQL journal_lines has no account_name column — display is always resolved from chart_of_accounts by account_id. " +
      "If the UI showed a wrong label (e.g. counterparty name on AR), it was from client-side AI fallbacks; those are fixed in the app layer.",
  };
}

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { listAccounts } from "@/lib/data/accounts";
import type { Account } from "@/lib/accounting";
import { listFixedAssetCapitalizationAccountMismatches } from "@/lib/data/fixed-assets";

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const v0 = new Array<number>(n + 1);
  const v1 = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) v0[j] = j;
  for (let i = 0; i < m; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < n; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= n; j++) v0[j] = v1[j];
  }
  return v0[n];
}

const SERVICE_KEYWORDS =
  /consultancy|consulting|saas|subscription|service|advisory|revenue|income|fees/i;

export type CoaSuspectRow = {
  code: string;
  name: string;
  type: string;
  is_active: boolean;
  journalLineCount: number;
  reason: string;
};

export async function reportChartOfAccountsSuspects(): Promise<CoaSuspectRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const accounts = (await listAccounts()) as Account[];
  const { data: lineCounts } = await supabase
    .from("journal_lines")
    .select("account_id")
    .eq("tenant_id", user.tenant.id);

  const countByAccount = new Map<string, number>();
  for (const row of lineCounts ?? []) {
    const aid = (row as { account_id?: string }).account_id;
    if (!aid) continue;
    countByAccount.set(aid, (countByAccount.get(aid) ?? 0) + 1);
  }

  const out: CoaSuspectRow[] = [];
  for (const a of accounts) {
    const code = a.code ?? "";
    const name = a.name ?? "";
    const reasons: string[] = [];
    if (!/^\d{4,5}$/.test(code)) reasons.push("code not 4–5 digits");
    if (name.length < 3) reasons.push("name very short");
    if (/^[^a-zA-Z\u0600-\u06FF]+$/.test(name.trim())) reasons.push("name has no letters");
    if (parseInt(code, 10) >= 10000) reasons.push("code ≥ 10000");
    if (reasons.length === 0) continue;
    out.push({
      code,
      name,
      type: a.type,
      is_active: a.is_active,
      journalLineCount: countByAccount.get(a.id) ?? 0,
      reason: reasons.join("; "),
    });
  }
  return out.sort((x, y) => x.code.localeCompare(y.code));
}

export type ContactDuplicatePair = {
  idA: string;
  nameA: string;
  codeA: string | null;
  idB: string;
  nameB: string;
  codeB: string | null;
  similarity: number;
  typeA: string | null;
  typeB: string | null;
};

function formatContactRoles(r: {
  is_customer: boolean;
  is_vendor: boolean;
  is_employee: boolean;
}): string {
  const p: string[] = [];
  if (r.is_customer) p.push("customer");
  if (r.is_vendor) p.push("vendor");
  if (r.is_employee) p.push("employee");
  return p.length ? p.join("+") : "—";
}

function similarityPct(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  const maxLen = Math.max(al.length, bl.length, 1);
  const dist = levenshteinDistance(al, bl);
  return Math.round(100 * (1 - dist / maxLen));
}

export async function reportContactDuplicatePairs(
  minSimilarity = 85,
): Promise<ContactDuplicatePair[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, code, is_customer, is_vendor, is_employee")
    .eq("tenant_id", user.tenant.id);
  if (error) throw error;

  const rows = data ?? [];
  const pairs: ContactDuplicatePair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const A = rows[i] as {
        id: string;
        name: string;
        code: string;
        is_customer: boolean;
        is_vendor: boolean;
        is_employee: boolean;
      };
      const B = rows[j] as typeof A;
      const sim = similarityPct(A.name, B.name);
      if (sim >= minSimilarity) {
        pairs.push({
          idA: A.id,
          nameA: A.name,
          codeA: A.code,
          idB: B.id,
          nameB: B.name,
          codeB: B.code,
          similarity: sim,
          typeA: formatContactRoles(A),
          typeB: formatContactRoles(B),
        });
      }
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity);
}

export type FixedAssetDuplicateRow = {
  nameKey: string;
  cost: number;
  purchaseDate: string;
  assetIds: string[];
  names: string[];
};

export async function reportFixedAssetDuplicates(): Promise<FixedAssetDuplicateRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("fixed_assets")
    .select("id, name, cost, purchase_date, is_active, disposed_at")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true)
    .is("disposed_at", null);
  if (error) throw error;

  type Row = { id: string; name: string; cost: number; purchase_date: string };
  const map = new Map<string, Row[]>();
  for (const r of data ?? []) {
    const row = r as Row;
    const key = `${normalizeFaName(row.name)}|${Number(row.cost).toFixed(2)}|${String(row.purchase_date).slice(0, 10)}`;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }

  const out: FixedAssetDuplicateRow[] = [];
  for (const [, list] of map) {
    if (list.length < 2) continue;
    out.push({
      nameKey: list[0].name,
      cost: Number(list[0].cost),
      purchaseDate: String(list[0].purchase_date).slice(0, 10),
      assetIds: list.map((x) => x.id),
      names: list.map((x) => x.name),
    });
  }
  return out.sort((a, b) => a.nameKey.localeCompare(b.nameKey));
}

function normalizeFaName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type InventoryServiceCandidateRow = {
  id: string;
  name: string;
  item_type: string;
  inventory_tracked: boolean;
  reason: string;
};

export async function reportInventoryServiceCandidates(): Promise<InventoryServiceCandidateRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data: items, error } = await supabase
    .from("inventory_items")
    .select("id, name, item_type, inventory_tracked")
    .eq("tenant_id", user.tenant.id);
  if (error) throw error;

  const { data: txCounts } = await supabase
    .from("inventory_transactions")
    .select("item_id")
    .eq("tenant_id", user.tenant.id);

  const txByItem = new Map<string, number>();
  for (const t of txCounts ?? []) {
    const id = (t as { item_id?: string }).item_id;
    if (!id) continue;
    txByItem.set(id, (txByItem.get(id) ?? 0) + 1);
  }

  const { data: balances } = await supabase
    .from("inventory_balances")
    .select("item_id, quantity")
    .eq("tenant_id", user.tenant.id);

  const qtyByItem = new Map<string, number>();
  for (const b of balances ?? []) {
    const row = b as { item_id?: string; quantity?: number };
    if (!row.item_id) continue;
    qtyByItem.set(row.item_id, Number(row.quantity ?? 0));
  }

  const out: InventoryServiceCandidateRow[] = [];
  for (const raw of items ?? []) {
    const it = raw as {
      id: string;
      name: string;
      item_type: string;
      inventory_tracked: boolean;
    };
    const reasons: string[] = [];
    if (it.item_type === "service") reasons.push("item_type is service");
    if (SERVICE_KEYWORDS.test(it.name)) reasons.push("name matches service keyword list");
    const q = qtyByItem.get(it.id) ?? 0;
    const txs = txByItem.get(it.id) ?? 0;
    if (q === 0 && txs === 0 && it.inventory_tracked) reasons.push("zero qty and no movements (review)");
    if (reasons.length === 0) continue;
    out.push({
      id: it.id,
      name: it.name,
      item_type: it.item_type,
      inventory_tracked: it.inventory_tracked,
      reason: reasons.join("; "),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadAllDataIntegritySections() {
  const [coaSuspects, contactPairs, fixedDupes, invCandidates, faCapAudit] = await Promise.all([
    reportChartOfAccountsSuspects(),
    reportContactDuplicatePairs(),
    reportFixedAssetDuplicates(),
    reportInventoryServiceCandidates(),
    listFixedAssetCapitalizationAccountMismatches(),
  ]);
  return { coaSuspects, contactPairs, fixedDupes, invCandidates, faCapAudit };
}

export type DataIntegritySections = Awaited<ReturnType<typeof loadAllDataIntegritySections>>;

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import type { Database } from "@/lib/database.types";
import { isFixedAssetChartAccount } from "@/lib/fixed-assets/coa-asset-account";

export type FixedAssetSummaryRow = Database["public"]["Views"]["v_fixed_assets_summary"]["Row"];
export type FixedAssetRow = Database["public"]["Tables"]["fixed_assets"]["Row"];
export type DepreciationScheduleRow = Database["public"]["Tables"]["depreciation_schedules"]["Row"];
export type FixedAssetTransferRow = Database["public"]["Tables"]["fixed_asset_transfers"]["Row"];

export type ListFixedAssetsFilter = {
  status?: "active" | "disposed" | "all";
  source?: "all" | "vendor_bill" | "manual" | "opening_balance";
  category?: string;
  location?: string;
  assignee?: string;
  purchaseFrom?: string;
  purchaseTo?: string;
  age?: "all" | "lt1" | "1to3" | "3to5" | "5plus";
};

function ageBucketFromPurchase(purchaseDate: string, ref: Date): "lt1" | "1to3" | "3to5" | "5plus" {
  const t = new Date(purchaseDate + "T12:00:00Z").getTime();
  const a = (ref.getTime() - t) / (1000 * 60 * 60 * 24 * 365.25);
  if (a < 1) return "lt1";
  if (a < 3) return "1to3";
  if (a < 5) return "3to5";
  return "5plus";
}

export function applyFixedAssetFilters(
  rows: FixedAssetSummaryRow[],
  f: ListFixedAssetsFilter,
  ref: Date = new Date(),
): FixedAssetSummaryRow[] {
  return rows.filter((r) => {
    if (f.source && f.source !== "all") {
      if ((r.source_type ?? "manual") !== f.source) return false;
    }
    if (f.category?.trim()) {
      if ((r.category ?? "").toLowerCase() !== f.category.trim().toLowerCase()) return false;
    }
    if (f.location?.trim()) {
      if (!(r.location ?? "").toLowerCase().includes(f.location.trim().toLowerCase())) return false;
    }
    if (f.assignee?.trim()) {
      if (!(r.assigned_to ?? "").toLowerCase().includes(f.assignee.trim().toLowerCase())) return false;
    }
    if (f.purchaseFrom) {
      if (String(r.purchase_date) < f.purchaseFrom) return false;
    }
    if (f.purchaseTo) {
      if (String(r.purchase_date) > f.purchaseTo) return false;
    }
    if (f.age && f.age !== "all" && r.purchase_date) {
      const b = ageBucketFromPurchase(r.purchase_date, ref);
      if (b !== f.age) return false;
    }
    return true;
  });
}

export async function listFixedAssetTransfers(assetId: string): Promise<FixedAssetTransferRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("fixed_asset_transfers")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("asset_id", assetId)
    .order("transfer_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FixedAssetTransferRow[];
}

export async function listFixedAssetsSummary(
  filter?: "active" | "disposed" | "all",
  more?: ListFixedAssetsFilter,
): Promise<FixedAssetSummaryRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("v_fixed_assets_summary")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("purchase_date", { ascending: false });

  if (error) throw error;

  let rows = (data ?? []) as FixedAssetSummaryRow[];
  const s = more?.status ?? filter ?? "active";
  if (s === "active") {
    rows = rows.filter((r) => Boolean(r.is_active) && !r.disposed_at);
  } else if (s === "disposed") {
    rows = rows.filter((r) => r.disposed_at);
  }
  if (more) {
    rows = applyFixedAssetFilters(rows, more, new Date());
  }
  return rows;
}

export async function getFixedAssetById(assetId: string): Promise<FixedAssetRow | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("id", assetId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listDepreciationScheduleForAsset(assetId: string): Promise<DepreciationScheduleRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("depreciation_schedules")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("asset_id", assetId)
    .order("period_start", { ascending: true });

  if (error) throw error;
  return (data ?? []) as DepreciationScheduleRow[];
}

export async function aggregateFixedAssetsTotals(
  filter?: "active" | "disposed" | "all",
  more?: ListFixedAssetsFilter,
): Promise<{
  totalCost: number;
  totalAccumulatedDepreciation: number;
  totalNbv: number;
  rowCount: number;
  activeInRegisterCount: number;
}> {
  const rows = await listFixedAssetsSummary(filter, more);
  const allActive = await listFixedAssetsSummary("active", more ? { ...more, status: "active" } : undefined);
  let totalCost = 0;
  let totalAccumulatedDepreciation = 0;
  let totalNbv = 0;
  for (const r of rows) {
    totalCost += Number(r.cost ?? 0);
    totalAccumulatedDepreciation += Number(r.accumulated_depreciation ?? 0);
    totalNbv += Number(r.net_book_value ?? 0);
  }
  return {
    totalCost,
    totalAccumulatedDepreciation,
    totalNbv,
    rowCount: rows.length,
    activeInRegisterCount: allActive.length,
  };
}

export type FixedAssetCapitalizationAuditRow = {
  assetId: string;
  assetName: string | null;
  cost: number | null;
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  accountType: string | null;
  accountDetailType: string | null;
};

/**
 * Assets whose capitalization account is not a fixed-asset (PPE) CoA row — for manual review only (no auto-fix).
 */
export async function listFixedAssetCapitalizationAccountMismatches(): Promise<FixedAssetCapitalizationAuditRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  const { data: assets, error } = await supabase
    .from("fixed_assets")
    .select("id, name, cost, asset_account_id")
    .eq("tenant_id", user.tenant.id);

  if (error) throw error;

  const rows = assets ?? [];
  const accountIds = [...new Set(rows.map((r) => r.asset_account_id).filter((id): id is string => Boolean(id)))];
  if (accountIds.length === 0) return [];

  const { data: coaRows, error: coaErr } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, type, detail_type")
    .eq("tenant_id", user.tenant.id)
    .in("id", accountIds);

  if (coaErr) throw coaErr;

  const byId = new Map((coaRows ?? []).map((a) => [a.id, a]));
  const out: FixedAssetCapitalizationAuditRow[] = [];

  for (const fa of rows) {
    const aid = fa.asset_account_id;
    if (!aid) continue;
    const acc = byId.get(aid);
    if (!acc) {
      out.push({
        assetId: fa.id,
        assetName: fa.name,
        cost: fa.cost,
        accountId: aid,
        accountCode: null,
        accountName: null,
        accountType: null,
        accountDetailType: null,
      });
      continue;
    }
    if (!isFixedAssetChartAccount(acc)) {
      out.push({
        assetId: fa.id,
        assetName: fa.name,
        cost: fa.cost,
        accountId: aid,
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        accountDetailType: acc.detail_type,
      });
    }
  }

  return out.sort((a, b) => (a.accountCode ?? "").localeCompare(b.accountCode ?? ""));
}

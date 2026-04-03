import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import type { Database } from "@/lib/database.types";

export type FixedAssetSummaryRow = Database["public"]["Views"]["v_fixed_assets_summary"]["Row"];
export type FixedAssetRow = Database["public"]["Tables"]["fixed_assets"]["Row"];
export type DepreciationScheduleRow = Database["public"]["Tables"]["depreciation_schedules"]["Row"];

export async function listFixedAssetsSummary(filter?: "active" | "disposed" | "all"): Promise<FixedAssetSummaryRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();
  let q = supabase
    .from("v_fixed_assets_summary")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("purchase_date", { ascending: false });

  const { data, error } = await q;
  if (error) throw error;

  let rows = (data ?? []) as FixedAssetSummaryRow[];
  if (filter === "active") {
    rows = rows.filter((r) => Boolean(r.is_active) && !r.disposed_at);
  } else if (filter === "disposed") {
    rows = rows.filter((r) => r.disposed_at);
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

export async function aggregateFixedAssetsTotals(filter?: "active" | "disposed" | "all"): Promise<{
  totalCost: number;
  totalAccumulatedDepreciation: number;
  totalNbv: number;
}> {
  const rows = await listFixedAssetsSummary(filter);
  let totalCost = 0;
  let totalAccumulatedDepreciation = 0;
  let totalNbv = 0;
  for (const r of rows) {
    totalCost += Number(r.cost ?? 0);
    totalAccumulatedDepreciation += Number(r.accumulated_depreciation ?? 0);
    totalNbv += Number(r.net_book_value ?? 0);
  }
  return { totalCost, totalAccumulatedDepreciation, totalNbv };
}

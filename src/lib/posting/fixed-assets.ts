import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { round2 } from "@/lib/posting/posting-engine";

export async function createFixedAssetFromPostedBill(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string;
    draftId: string;
    journalEntryId: string;
    purchaseDate: string; // YYYY-MM-DD
    subtotalAmount: number;
    asset: {
      name: string;
      category: string;
      asset_account_id: string;
      useful_life_years: number;
      depreciation_method: "straight_line";
    };
  },
) {
  const { tenantId, purchaseDate, subtotalAmount, asset } = params;
  const purchaseValue = round2(Number(subtotalAmount));
  const nbv = purchaseValue;

  const { data: row, error } = await (supabase.from("fixed_assets" as never) as any)
    .insert({
      tenant_id: tenantId,
      name: asset.name,
      category: asset.category,
      purchase_value: purchaseValue,
      purchase_date: purchaseDate,
      useful_life_years: asset.useful_life_years,
      depreciation_method: asset.depreciation_method,
      accumulated_depreciation: 0,
      net_book_value: nbv,
      asset_account_id: asset.asset_account_id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[fixed_assets] insert", error);
    throw new Error(typeof (error as any)?.message === "string" ? (error as any).message : "Failed to create asset.");
  }
  const assetId = row?.id as string | undefined;
  if (!assetId) return;

  // Straight-line monthly schedule
  const months = asset.useful_life_years * 12;
  const monthly = round2(purchaseValue / months);
  const start = new Date(`${purchaseDate}T00:00:00Z`);
  const periods: Array<{ period_start: string; amount: number }> = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    periods.push({ period_start: d.toISOString().slice(0, 10), amount: monthly });
  }

  const { error: schedErr } = await (supabase.from("fixed_asset_depreciation_schedule" as never) as any).insert(
    periods.map((p) => ({
      tenant_id: tenantId,
      asset_id: assetId,
      period_start: p.period_start,
      amount: p.amount,
      posted_entry_id: null,
    })),
  );
  if (schedErr) {
    console.error("[fixed_assets] schedule insert", schedErr);
    // don't fail posting if schedule insert fails; asset exists
  }
}


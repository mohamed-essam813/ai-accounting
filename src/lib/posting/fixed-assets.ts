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
  const { tenantId, purchaseDate, subtotalAmount, asset, journalEntryId, draftId } = params;
  const cost = round2(Number(subtotalAmount));
  const usefulLifeMonths = Math.max(1, Math.round(asset.useful_life_years * 12));

  const insert: Database["public"]["Tables"]["fixed_assets"]["Insert"] = {
    tenant_id: tenantId,
    name: asset.name,
    category: asset.category,
    cost,
    useful_life_months: usefulLifeMonths,
    residual_value: 0,
    depreciation_method: "straight_line",
    purchase_date: purchaseDate,
    start_depreciation_date: purchaseDate,
    is_active: true,
    description: null,
    asset_account_id: asset.asset_account_id,
    source_journal_entry_id: journalEntryId,
    source_draft_id: draftId,
  };

  const { data: row, error } = await supabase.from("fixed_assets").insert(insert).select("id").single();

  if (error) {
    console.error("[fixed_assets] insert", error);
    throw new Error(typeof error.message === "string" ? error.message : "Failed to create fixed asset.");
  }
  if (!row?.id) return;

  // Depreciation rows are created when monthly depreciation runs (see processMonthlyDepreciation).
}

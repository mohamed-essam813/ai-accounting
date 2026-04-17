import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { round2 } from "@/lib/posting/posting-engine";
import type { AssetDraft } from "@/components/fixed-asset-review-panel";
import type { DepreciationMethod } from "@/components/prompt/bill-line-editor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssetParams = {
  name: string;
  category: string;
  asset_account_id: string;
  useful_life_years: number;
  /** Mapped for DB: straight_line | reducing_balance only (units_of_production → straight_line, none → straight_line) */
  depreciation_method: "straight_line" | "reducing_balance";
  /** Original raw value from UI — stored for informational purposes */
  depreciation_method_raw?: DepreciationMethod;
  residual_value?: number;
  start_depreciation_date?: string;
  serial_number?: string;
  location?: string;
  assigned_to?: string;
  /** If > 1, create N asset register rows splitting total cost across assets */
  quantity?: number;
  /** Per-asset name/serial/location overrides when quantity > 1 */
  asset_drafts?: AssetDraft[];
};

// ─── Asset code helper ────────────────────────────────────────────────────────

async function reserveAssetCode(supabase: SupabaseClient<Database>, tenantId: string, year: number): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("next_asset_code", {
    p_tenant_id: tenantId,
    p_year: year,
  });
  if (error) throw new Error(`Failed to reserve asset code: ${error.message}`);
  return data as string;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Creates one or more fixed asset register rows from a posted bill line.
 * When `asset.quantity > 1` the total cost is split evenly; the last asset
 * absorbs any rounding difference. `asset_drafts` provides per-asset overrides.
 *
 * All inserts use the service-role client — call from server-side only.
 */
export async function createFixedAssetFromPostedBill(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string;
    draftId: string;
    journalEntryId: string;
    purchaseDate: string; // YYYY-MM-DD
    subtotalAmount: number;
    billLineId?: string;
    asset: AssetParams;
  },
): Promise<void> {
  const { tenantId, purchaseDate, subtotalAmount, asset, journalEntryId, draftId, billLineId } = params;
  const totalCost = round2(Number(subtotalAmount));
  const qty = Math.max(1, asset.quantity ?? 1);
  const usefulLifeMonths = Math.max(1, Math.round(asset.useful_life_years * 12));
  const residualValue = round2(asset.residual_value ?? 0);
  const year = new Date(purchaseDate).getFullYear();

  // Build per-asset cost split
  const baseCostEach = round2(totalCost / qty);
  const costSplit: number[] = [];
  if (qty === 1) {
    costSplit.push(totalCost);
  } else {
    let runningTotal = 0;
    for (let i = 0; i < qty - 1; i++) {
      const draft = asset.asset_drafts?.[i];
      const override = draft?.costOverride ? parseFloat(draft.costOverride) : null;
      const cost = Number.isFinite(override) && override! > 0 ? round2(override!) : baseCostEach;
      costSplit.push(cost);
      runningTotal += cost;
    }
    // Last asset absorbs remainder
    costSplit.push(round2(totalCost - runningTotal));
  }

  // Insert all N rows
  for (let i = 0; i < qty; i++) {
    const draft = asset.asset_drafts?.[i];
    const assetName = qty > 1
      ? (draft?.name?.trim() || `${asset.name} ${i + 1}`)
      : asset.name;

    const assetCode = await reserveAssetCode(supabase, tenantId, year);

    const insert: Database["public"]["Tables"]["fixed_assets"]["Insert"] = {
      tenant_id: tenantId,
      name: assetName,
      category: asset.category,
      cost: costSplit[i],
      useful_life_months: usefulLifeMonths,
      residual_value: residualValue,
      depreciation_method: asset.depreciation_method,
      purchase_date: purchaseDate,
      start_depreciation_date: asset.start_depreciation_date ?? purchaseDate,
      is_active: true,
      description: null,
      asset_account_id: asset.asset_account_id,
      source_journal_entry_id: journalEntryId,
      source_draft_id: draftId,
      // New fields (may not be typed in generated types yet — cast via unknown)
      ...(assetCode ? { asset_code: assetCode } : {}),
      ...(draft?.serialNumber || asset.serial_number
        ? { serial_number: draft?.serialNumber || asset.serial_number }
        : {}),
      ...(draft?.location || asset.location
        ? { location: draft?.location || asset.location }
        : {}),
      ...(asset.assigned_to ? { assigned_to: asset.assigned_to } : {}),
      ...(billLineId ? { source_bill_line_id: billLineId } : {}),
    } as Database["public"]["Tables"]["fixed_assets"]["Insert"];

    const { error } = await supabase.from("fixed_assets").insert(insert);

    if (error) {
      console.error("[fixed_assets] insert failed for asset", i + 1, error);
      throw new Error(typeof error.message === "string" ? error.message : "Failed to create fixed asset.");
    }
  }
}

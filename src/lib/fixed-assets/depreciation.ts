/**
 * Fixed Assets & Depreciation Logic
 * MVP Feedback Section 8: Fixed Assets & Depreciation
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { createJournalEntryAction } from "@/lib/actions/journals";
import { getAccountByCode } from "@/lib/data/accounts";

export type DepreciationMethod = "straight_line" | "reducing_balance";

export interface FixedAsset {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string;
  cost: number;
  useful_life_months: number;
  residual_value: number;
  depreciation_method: DepreciationMethod;
  purchase_date: string;
  start_depreciation_date: string | null;
  is_active: boolean;
  disposed_at: string | null;
  disposal_proceeds: number | null;
  disposal_gain_loss: number | null;
}

export interface DepreciationSchedule {
  id: string;
  tenant_id: string;
  asset_id: string;
  period_start: string;
  period_end: string;
  depreciation_amount: number;
  accumulated_depreciation: number;
  net_book_value: number;
  journal_entry_id: string | null;
}

/**
 * Calculate monthly depreciation for an asset
 * MVP Feedback: Automatic monthly depreciation journals
 */
export async function calculateMonthlyDepreciation(
  assetId: string,
  periodStart: string, // First day of month (YYYY-MM-01)
): Promise<number> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved");
  }

  const supabase = await createServerSupabaseClient();

  // Get asset details
  const { data: asset, error: assetError } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("id", assetId)
    .maybeSingle();

  if (assetError || !asset) {
    throw new Error("Asset not found");
  }

  if (!asset.is_active || asset.disposed_at) {
    return 0; // Asset is disposed or inactive
  }

  if (!asset.start_depreciation_date) {
    return 0; // Depreciation hasn't started
  }

  // Get latest depreciation record to get current NBV
  const { data: latestDepreciation } = await supabase
    .from("depreciation_schedules")
    .select("net_book_value, accumulated_depreciation")
    .eq("asset_id", assetId)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentNBV = latestDepreciation
    ? Number(latestDepreciation.net_book_value)
    : Number(asset.cost);

  // Calculate depreciation based on method
  if (asset.depreciation_method === "straight_line") {
    const { data, error } = await supabase.rpc("calculate_depreciation_straight_line", {
      p_cost: asset.cost,
      p_residual_value: asset.residual_value,
      p_useful_life_months: asset.useful_life_months,
    });

    if (error) {
      throw error;
    }

    return Number(data || 0);
  } else {
    // Reducing Balance
    const { data, error } = await supabase.rpc("calculate_depreciation_reducing_balance", {
      p_cost: asset.cost,
      p_residual_value: asset.residual_value,
      p_useful_life_months: asset.useful_life_months,
      p_current_nbv: currentNBV,
    });

    if (error) {
      throw error;
    }

    return Number(data || 0);
  }
}

/**
 * Generate monthly depreciation journal entry
 * MVP Feedback: Depreciation affects profit, not cash
 * Posting: Dr Depreciation Expense, Cr Accumulated Depreciation
 */
export async function generateDepreciationJournal(
  assetId: string,
  periodStart: string,
  depreciationAmount: number,
): Promise<string> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved");
  }

  // Get accounts
  const depreciationExpenseAccount = await getAccountByCode("5600"); // Depreciation Expense
  const accumulatedDepreciationAccount = await getAccountByCode("1600"); // Accumulated Depreciation

  if (!depreciationExpenseAccount || !accumulatedDepreciationAccount) {
    throw new Error("Required accounts not found. Please ensure accounts 5600 (Depreciation Expense) and 1600 (Accumulated Depreciation) exist.");
  }

  // Get asset name for description
  const supabase = await createServerSupabaseClient();
  const { data: asset } = await supabase
    .from("fixed_assets")
    .select("name")
    .eq("id", assetId)
    .maybeSingle();

  const assetName = asset?.name || "Asset";

  // Create journal entry
  const periodDate = new Date(periodStart);
  const description = `Monthly depreciation: ${assetName} - ${periodDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`;

  const journalEntryId = await createJournalEntryAction({
    date: periodStart,
    description,
    lines: [
      {
        account_id: depreciationExpenseAccount.id,
        debit: depreciationAmount,
        credit: 0,
        memo: `Depreciation for ${assetName}`,
      },
      {
        account_id: accumulatedDepreciationAccount.id,
        debit: 0,
        credit: depreciationAmount,
        memo: `Accumulated depreciation for ${assetName}`,
      },
    ],
  });

  return journalEntryId;
}

/**
 * Process monthly depreciation for all active assets
 * MVP Feedback: Automatic monthly depreciation journals
 */
export async function processMonthlyDepreciation(
  periodStart: string, // First day of month (YYYY-MM-01)
): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved");
  }

  const supabase = await createServerSupabaseClient();

  // Get all active assets that should be depreciated
  const { data: assets, error } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true)
    .is("disposed_at", null)
    .not("start_depreciation_date", "is", null);

  if (error) {
    throw error;
  }

  if (!assets || assets.length === 0) {
    return; // No assets to depreciate
  }

  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  periodEnd.setDate(0); // Last day of month

  // Process each asset
  for (const asset of assets) {
    // Check if depreciation already exists for this period
    const { data: existing } = await supabase
      .from("depreciation_schedules")
      .select("id")
      .eq("asset_id", asset.id)
      .eq("period_start", periodStart)
      .maybeSingle();

    if (existing) {
      continue; // Already depreciated for this period
    }

    // Calculate depreciation
    const depreciationAmount = await calculateMonthlyDepreciation(asset.id, periodStart);

    if (depreciationAmount <= 0) {
      continue; // No depreciation needed
    }

    // Get latest depreciation to calculate accumulated
    const { data: latestDepreciation } = await supabase
      .from("depreciation_schedules")
      .select("accumulated_depreciation, net_book_value")
      .eq("asset_id", asset.id)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousAccumulated = latestDepreciation
      ? Number(latestDepreciation.accumulated_depreciation)
      : 0;
    const previousNBV = latestDepreciation
      ? Number(latestDepreciation.net_book_value)
      : Number(asset.cost);

    const newAccumulated = previousAccumulated + depreciationAmount;
    const newNBV = previousNBV - depreciationAmount;

    // Generate journal entry
    const journalEntryId = await generateDepreciationJournal(
      asset.id,
      periodStart,
      depreciationAmount,
    );

    // Create depreciation schedule record
    await supabase.from("depreciation_schedules").insert({
      tenant_id: user.tenant.id,
      asset_id: asset.id,
      period_start: periodStart,
      period_end: periodEnd.toISOString().split("T")[0],
      depreciation_amount: depreciationAmount,
      accumulated_depreciation: newAccumulated,
      net_book_value: newNBV,
      journal_entry_id: journalEntryId,
    });
  }
}


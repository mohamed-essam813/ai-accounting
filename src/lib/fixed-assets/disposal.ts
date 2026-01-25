/**
 * Asset Disposal & Gain/Loss Logic
 * MVP Feedback Section 9: Asset Disposal & Gain / Loss
 * 
 * Gain/Loss = Proceeds - Net Book Value
 * Gain/loss must appear before Net Profit in P&L
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { createJournalEntryAction } from "@/lib/actions/journals";
import { getAccountByCode } from "@/lib/data/accounts";

/**
 * Dispose of a fixed asset
 * MVP Feedback: At disposal, remove asset cost, remove accumulated depreciation,
 * record proceeds, recognize gain or loss
 */
export async function disposeAsset(
  assetId: string,
  disposalDate: string,
  proceeds: number,
  description?: string,
): Promise<{ journalEntryId: string; gainLoss: number }> {
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

  if (asset.disposed_at) {
    throw new Error("Asset already disposed");
  }

  // Get latest depreciation to get current NBV
  const { data: latestDepreciation } = await supabase
    .from("depreciation_schedules")
    .select("net_book_value, accumulated_depreciation")
    .eq("asset_id", assetId)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const netBookValue = latestDepreciation
    ? Number(latestDepreciation.net_book_value)
    : Number(asset.cost);
  const accumulatedDepreciation = latestDepreciation
    ? Number(latestDepreciation.accumulated_depreciation)
    : 0;

  // Calculate gain/loss
  // MVP Feedback: Gain/Loss = Proceeds - Net Book Value
  const gainLoss = proceeds - netBookValue;

  // Get accounts
  const ppeAccount = await getAccountByCode("1500"); // Property, Plant & Equipment
  const accumulatedDepreciationAccount = await getAccountByCode("1600"); // Accumulated Depreciation
  const cashAccount = await getAccountByCode("1000"); // Cash (or bank account)
  const gainLossAccount = await getAccountByCode("4200"); // Gain on Asset Disposal (Other Income)

  if (!ppeAccount || !accumulatedDepreciationAccount || !cashAccount || !gainLossAccount) {
    throw new Error(
      "Required accounts not found. Please ensure accounts 1500 (PPE), 1600 (Accumulated Depreciation), 1000 (Cash), and 4200 (Gain on Asset Disposal) exist.",
    );
  }

  // Create journal entry for disposal
  // MVP Feedback posting logic:
  // - Remove asset cost (Cr PPE)
  // - Remove accumulated depreciation (Dr Accumulated Depreciation)
  // - Record proceeds (Dr Cash)
  // - Recognize gain or loss (Cr Gain if gain, Dr Loss if loss)
  const journalLines: Array<{
    account_id: string;
    debit: number;
    credit: number;
    memo: string;
  }> = [
    // Remove accumulated depreciation
    {
      account_id: accumulatedDepreciationAccount.id,
      debit: accumulatedDepreciation,
      credit: 0,
      memo: `Remove accumulated depreciation for ${asset.name}`,
    },
    // Remove asset cost
    {
      account_id: ppeAccount.id,
      debit: 0,
      credit: Number(asset.cost),
      memo: `Remove asset cost for ${asset.name}`,
    },
    // Record proceeds
    {
      account_id: cashAccount.id,
      debit: proceeds,
      credit: 0,
      memo: `Proceeds from disposal of ${asset.name}`,
    },
  ];

  // Add gain or loss
  if (gainLoss > 0) {
    // Gain: Credit to Other Income
    journalLines.push({
      account_id: gainLossAccount.id,
      debit: 0,
      credit: gainLoss,
      memo: `Gain on disposal of ${asset.name}`,
    });
  } else if (gainLoss < 0) {
    // Loss: Debit to Other Expense (or Loss account)
    // For now, we'll use a loss account - you may want to create account 5700 for Loss on Asset Disposal
    const lossAccount = await getAccountByCode("5700"); // Loss on Asset Disposal
    if (lossAccount) {
      journalLines.push({
        account_id: lossAccount.id,
        debit: Math.abs(gainLoss),
        credit: 0,
        memo: `Loss on disposal of ${asset.name}`,
      });
    } else {
      // Fallback: use expense account
      const expenseAccount = await getAccountByCode("5000"); // General Expense
      if (expenseAccount) {
        journalLines.push({
          account_id: expenseAccount.id,
          debit: Math.abs(gainLoss),
          credit: 0,
          memo: `Loss on disposal of ${asset.name}`,
        });
      }
    }
  }

  const journalDescription =
    description || `Disposal of ${asset.name} - Proceeds: ${proceeds}, NBV: ${netBookValue}`;

  const journalEntryId = await createJournalEntryAction(
    {
      date: disposalDate,
      description: journalDescription,
      lines: journalLines,
    },
    { postImmediately: true },
  );

  // Update asset record
  await supabase
    .from("fixed_assets")
    .update({
      is_active: false,
      disposed_at: disposalDate,
      disposal_proceeds: proceeds,
      disposal_gain_loss: gainLoss,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId);

  return { journalEntryId, gainLoss };
}


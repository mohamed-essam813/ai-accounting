/**
 * Fixed Assets & Depreciation Logic
 * MVP Feedback Section 8: Fixed Assets & Depreciation
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarMonths, endOfMonth, format, parseISO } from "date-fns";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { getCurrentUser } from "@/lib/data/users";
import { createJournalEntryAction } from "@/lib/actions/journals";
import { getAccountByCode } from "@/lib/data/accounts";
import { round2 } from "@/lib/posting/posting-engine";
import {
  computeStraightLineForPeriod,
  isStraightLine,
} from "@/lib/fixed-assets/depreciation-straight-line";
import type { AssetForDepr } from "@/lib/fixed-assets/depreciation-straight-line";
import { straightLineMonthlyBase } from "@/lib/fixed-assets/depreciation-straight-line";

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

type Supabase = SupabaseClient<Database>;

/**
 * One period of depreciation: straight-line (with proration), or reducing-balance (RPC / NBV).
 */
export async function computeDepreciationForPeriod(
  supabase: Supabase,
  asset: AssetForDepr,
  periodStart: string,
  previousAccum: number,
  currentNBV: number,
): Promise<number> {
  if (asset.disposed_at || !asset.start_depreciation_date) {
    return 0;
  }

  if (isStraightLine(asset.depreciation_method)) {
    const { amount } = computeStraightLineForPeriod(asset, periodStart, previousAccum);
    return amount;
  }

  const { data, error } = await supabase.rpc("calculate_depreciation_reducing_balance", {
    p_cost: asset.cost,
    p_residual_value: asset.residual_value,
    p_useful_life_months: asset.useful_life_months,
    p_current_nbv: currentNBV,
  });

  if (error) throw error;
  const v = round2(Math.min(Number(data || 0), round2(currentNBV - round2(asset.residual_value))));
  return v < 0.01 ? 0 : v;
}

export type DepreciationPreviewLine = {
  assetId: string;
  name: string;
  cost: number;
  monthsElapsed: number;
  monthlyDeprecBase: number;
  thisPeriod: number;
  accumAfter: number;
  nbvAfter: number;
  alreadyPosted: boolean;
  skipNote?: string;
};

export type DepreciationPreview = {
  period: string;
  baseCurrency: string;
  lineCount: number;
  totalDepreciation: number;
  lines: DepreciationPreviewLine[];
  message?: string;
};

/**
 * Read-only run for the same population as the monthly job (active, not disposed, with start date).
 */
export async function buildDepreciationPreview(periodStart: string): Promise<DepreciationPreview> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved");
  }
  const supabase = await createServerSupabaseClient();
  const { getTenantBaseCurrency } = await import("@/lib/utils/currency-conversion");
  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);

  const { data: assets, error } = await supabase
    .from("fixed_assets")
    .select(
      "id, name, cost, useful_life_months, residual_value, depreciation_method, purchase_date, start_depreciation_date, disposed_at",
    )
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true)
    .is("disposed_at", null)
    .not("start_depreciation_date", "is", null);

  if (error) throw error;
  if (!assets?.length) {
    return {
      period: periodStart.slice(0, 7),
      baseCurrency,
      lineCount: 0,
      totalDepreciation: 0,
      lines: [],
      message: "No active assets in the depreciation run.",
    };
  }

  const endAccr = endOfMonth(parseISO(periodStart));
  const lines: DepreciationPreviewLine[] = [];
  let total = 0;
  let toDepreciate = 0;

  for (const a of assets) {
    const { data: previousRow } = await supabase
      .from("depreciation_schedules")
      .select("accumulated_depreciation, period_start, net_book_value")
      .eq("asset_id", a.id)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: existing } = await supabase
      .from("depreciation_schedules")
      .select("id")
      .eq("asset_id", a.id)
      .eq("period_start", periodStart)
      .maybeSingle();

    const alreadyPosted = Boolean(existing);
    const previousAccum = previousRow ? Number(previousRow.accumulated_depreciation) : 0;
    const currentNBV = previousRow ? Number(previousRow.net_book_value) : Number(a.cost);
    const depStart = a.start_depreciation_date as string;
    const monthsElapsed = Math.max(
      0,
      differenceInCalendarMonths(endAccr, parseISO(depStart)),
    );

    const forDep: AssetForDepr = {
      id: a.id,
      cost: a.cost,
      useful_life_months: a.useful_life_months,
      residual_value: a.residual_value,
      depreciation_method: a.depreciation_method,
      start_depreciation_date: a.start_depreciation_date,
      disposed_at: a.disposed_at,
      purchase_date: a.purchase_date,
    };

    const thisPeriod = alreadyPosted
      ? 0
      : await computeDepreciationForPeriod(supabase, forDep, periodStart, previousAccum, currentNBV);

    const base = isStraightLine(a.depreciation_method)
      ? straightLineMonthlyBase(a.cost, a.residual_value, a.useful_life_months)
      : thisPeriod;
    const accumAfter = alreadyPosted
      ? previousAccum
      : round2(previousAccum + (thisPeriod > 0 ? thisPeriod : 0));
    const nbvAfter = alreadyPosted
      ? currentNBV
      : round2(Number(a.cost) - accumAfter);

    if (thisPeriod > 0) {
      total = round2(total + thisPeriod);
      toDepreciate += 1;
    }

    let skipNote: string | undefined;
    if (alreadyPosted) {
      skipNote = "Depreciation already posted for this period.";
    } else if (thisPeriod <= 0) {
      skipNote = "No amount (not in service, fully depreciated, or not applicable).";
    }

    lines.push({
      assetId: a.id,
      name: a.name,
      cost: a.cost,
      monthsElapsed,
      monthlyDeprecBase: base,
      thisPeriod: alreadyPosted ? 0 : thisPeriod,
      accumAfter: alreadyPosted ? previousAccum : accumAfter,
      nbvAfter: alreadyPosted ? currentNBV : nbvAfter,
      alreadyPosted,
      skipNote,
    });
  }

  const periodLabel = periodStart.slice(0, 7);
  return {
    period: periodLabel,
    baseCurrency,
    lineCount: toDepreciate,
    totalDepreciation: total,
    lines: lines.sort((u, v) => u.name.localeCompare(v.name)),
  };
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
  const periodYyyyMm = periodStart.slice(0, 7);
  const description = `Monthly depreciation — ${assetName} — ${periodYyyyMm}`;

  const journalEntryId = await createJournalEntryAction(
    {
      date: periodStart,
      description,
      lines: [
        {
          account_id: depreciationExpenseAccount.id,
          debit: depreciationAmount,
          credit: 0,
          memo: `Monthly depreciation — ${assetName} — ${periodYyyyMm}`,
        },
        {
          account_id: accumulatedDepreciationAccount.id,
          debit: 0,
          credit: depreciationAmount,
          memo: `Monthly depreciation — ${assetName} — ${periodYyyyMm}`,
        },
      ],
    },
    { postImmediately: true, sourceModule: "system_depreciation" },
  );

  return journalEntryId;
}

export type ProcessDepreciationResult = {
  /** New journal lines posted in this run */
  entriesPosted: number;
  message?: string;
};

/**
 * Process monthly depreciation for all active assets. Idempotent per (asset, period) via
 * `depreciation_schedules` unique (asset_id, period_start). Re-runs for the same period
 * with nothing new to post are not errors.
 */
export async function processMonthlyDepreciation(periodStart: string): Promise<ProcessDepreciationResult> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved");
  }

  const supabase = await createServerSupabaseClient();

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
    return { entriesPosted: 0, message: "No active fixed assets in the run." };
  }

  const periodYyyyMm = periodStart.slice(0, 7);
  const periodEnd = format(endOfMonth(parseISO(periodStart)), "yyyy-MM-dd");

  let entriesPosted = 0;
  let alreadyPostedCount = 0;
  for (const asset of assets) {
    const { data: existing } = await supabase
      .from("depreciation_schedules")
      .select("id")
      .eq("asset_id", asset.id)
      .eq("period_start", periodStart)
      .maybeSingle();
    if (existing) {
      alreadyPostedCount += 1;
      continue;
    }

    const { data: latestDepreciation } = await supabase
      .from("depreciation_schedules")
      .select("accumulated_depreciation, net_book_value, period_start")
      .eq("asset_id", asset.id)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousAccumulated = latestDepreciation
      ? Number(latestDepreciation.accumulated_depreciation)
      : 0;
    const currentNBV = latestDepreciation
      ? Number(latestDepreciation.net_book_value)
      : Number(asset.cost);

    const forDep: AssetForDepr = {
      id: asset.id,
      cost: asset.cost,
      useful_life_months: asset.useful_life_months,
      residual_value: asset.residual_value,
      depreciation_method: asset.depreciation_method,
      start_depreciation_date: asset.start_depreciation_date,
      disposed_at: asset.disposed_at,
      purchase_date: asset.purchase_date,
    };

    const depreciationAmount = await computeDepreciationForPeriod(
      supabase,
      forDep,
      periodStart,
      previousAccumulated,
      currentNBV,
    );

    if (depreciationAmount <= 0) {
      continue;
    }

    const newAccumulated = round2(previousAccumulated + depreciationAmount);
    const newNBV = round2(round2(Number(asset.cost)) - newAccumulated);
    const journalEntryId = await generateDepreciationJournal(
      asset.id,
      periodStart,
      depreciationAmount,
    );
    const { error: insErr } = await supabase.from("depreciation_schedules").insert({
      tenant_id: user.tenant.id,
      asset_id: asset.id,
      period_start: periodStart,
      period_end: periodEnd,
      depreciation_amount: depreciationAmount,
      accumulated_depreciation: newAccumulated,
      net_book_value: newNBV,
      journal_entry_id: journalEntryId,
    });
    if (insErr) {
      throw insErr;
    }
    entriesPosted += 1;
  }

  if (entriesPosted === 0) {
    if (assets.length > 0 && alreadyPostedCount === assets.length) {
      return { entriesPosted: 0, message: `Depreciation already posted for ${periodYyyyMm}.` };
    }
    return {
      entriesPosted: 0,
      message: `No new depreciation to post for ${periodYyyyMm} (not in service, fully depreciated, or N/A for this run).`,
    };
  }
  return { entriesPosted, message: `Posted ${entriesPosted} asset depreciation line(s) for ${periodYyyyMm}.` };
}


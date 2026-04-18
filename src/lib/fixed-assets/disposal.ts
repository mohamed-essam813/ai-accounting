/**
 * Asset Disposal & Gain/Loss
 * Proceeds vs NBV: gain/loss; default other income 7100 / other expense 7200.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { createJournalEntryAction } from "@/lib/actions/journals";
import { getAccountByCode } from "@/lib/data/accounts";
import { round2 } from "@/lib/posting/posting-engine";
import type { Database } from "@/lib/database.types";

export type DisposalMethod = "sold" | "scrapped" | "donated" | "lost" | "written_off";

export type DisposeAssetInput = {
  assetId: string;
  disposalDate: string;
  proceeds: number;
  method: DisposalMethod;
  reason: string;
  notes?: string | null;
  recipientOrBuyer?: string | null;
};

export class MissingGainLossAccountsError extends Error {
  constructor(readonly missing: ("gain" | "loss" | "cash" | "accum" | "ppe")[]) {
    super(
      `Add required chart accounts: ${missing.join(
        ", ",
      )} — 7100 Gain on Disposal, 7200 Loss on Disposal, 1000 Bank/Cash, 1600 Accumulated Depreciation, and the asset (PPE) line.`,
    );
  }
}

/** Latest depreciation row on or before the accrual month of disposal (YYYY-MM comparison). */
function resolveNbvAtDisposal(
  cost: number,
  residual: number,
  schedules: { period_start: string; accumulated_depreciation: number; net_book_value: number }[],
  disposalDate: string,
) {
  const limitYm = disposalDate.slice(0, 7);
  const eligible = (schedules ?? [])
    .filter((r) => r.period_start.slice(0, 7) <= limitYm)
    .sort((a, b) => a.period_start.localeCompare(b.period_start));
  const best = eligible.length ? eligible[eligible.length - 1] : null;
  if (best) {
    return {
      netBookValue: round2(
        Math.max(0, Math.min(Number(best.net_book_value), round2(cost) - round2(residual) + 1e-6)),
      ),
      accumulated: round2(Number(best.accumulated_depreciation)),
    };
  }
  return { netBookValue: round2(cost), accumulated: 0 };
}

export async function disposeAsset(input: DisposeAssetInput): Promise<{
  journalEntryId: string;
  gainLoss: number;
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved");
  }

  const { assetId, disposalDate, proceeds, method, reason, notes, recipientOrBuyer } = input;
  if (!reason.trim()) {
    throw new Error("Disposal reason is required.");
  }

  const supabase = await createServerSupabaseClient();
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

  const { data: allSched, error: schErr } = await supabase
    .from("depreciation_schedules")
    .select("period_start, accumulated_depreciation, net_book_value")
    .eq("asset_id", assetId)
    .order("period_start", { ascending: true });
  if (schErr) throw schErr;

  const { netBookValue, accumulated: accumulatedDepreciation } = resolveNbvAtDisposal(
    Number(asset.cost),
    Number(asset.residual_value),
    (allSched ?? []) as { period_start: string; accumulated_depreciation: number; net_book_value: number }[],
    disposalDate,
  );
  const cost = round2(asset.cost);
  const gainLoss = round2(proceeds - netBookValue);

  const ppeId = asset.asset_account_id as string | null;
  const ppeAccount = ppeId
    ? (await supabase.from("chart_of_accounts").select("id, code, name").eq("id", ppeId).maybeSingle()).data
    : (await getAccountByCode("1500"));

  const accumulatedDepreciationAccount = await getAccountByCode("1600");
  const cashOrBank = await getAccountByCode("1000");
  const gainAccount = await getAccountByCode("7100");
  const lossAccount = await getAccountByCode("7200");

  const missing: ("gain" | "loss" | "cash" | "accum" | "ppe")[] = [];
  if (!accumulatedDepreciationAccount) missing.push("accum");
  if (proceeds > 0.005 && !cashOrBank) missing.push("cash");
  if (gainLoss > 0.005 && !gainAccount) missing.push("gain");
  if (gainLoss < -0.005 && !lossAccount) missing.push("loss");
  if (!ppeAccount) missing.push("ppe");
  if (missing.length) {
    throw new MissingGainLossAccountsError(missing);
  }
  if (!ppeAccount) {
    throw new Error("PPE account is required for disposal.");
  }
  const ppeResolved = ppeAccount;

  const lineMemo = (tag: string) => `Disposal — ${asset.name} — ${method} — ${disposalDate}. ${tag}`;

  const lines: { account_id: string; debit: number; credit: number; memo: string }[] = [
    {
      account_id: accumulatedDepreciationAccount!.id,
      debit: accumulatedDepreciation,
      credit: 0,
      memo: lineMemo("Remove accumulated depreciation (1600)"),
    },
    { account_id: ppeResolved.id, debit: 0, credit: cost, memo: lineMemo("Remove asset cost from PPE") },
  ];

  if (proceeds > 0.005) {
    lines.push({
      account_id: cashOrBank!.id,
      debit: proceeds,
      credit: 0,
      memo: lineMemo("Proceeds (bank/cash 1000 — adjust in journal if a different account applies)"),
    });
  }
  if (gainLoss > 0.005) {
    lines.push({ account_id: gainAccount!.id, debit: 0, credit: gainLoss, memo: lineMemo("Gain on disposal (7100)") });
  } else if (gainLoss < -0.005) {
    lines.push({
      account_id: lossAccount!.id,
      debit: Math.abs(gainLoss),
      credit: 0,
      memo: lineMemo("Loss on disposal (7200)"),
    });
  }

  const extra = [recipientOrBuyer, notes].filter(Boolean).join(" — ");
  const desc = `Disposal of ${asset.name} on ${disposalDate} — ${method}${extra ? ` — ${extra}` : ""}`;

  const journalEntryId = await createJournalEntryAction(
    { date: disposalDate, description: desc, lines },
    { postImmediately: true, sourceModule: "system_disposal" },
  );

  const upd: Database["public"]["Tables"]["fixed_assets"]["Update"] = {
    is_active: false,
    disposed_at: disposalDate,
    disposal_proceeds: proceeds,
    disposal_gain_loss: gainLoss,
    disposal_method: method,
    disposal_reason: reason,
    disposal_notes: notes ?? null,
    disposal_recipient: recipientOrBuyer ?? null,
    disposal_journal_entry_id: journalEntryId,
    updated_at: new Date().toISOString(),
  };
  await supabase.from("fixed_assets").update(upd).eq("id", assetId).eq("tenant_id", user.tenant.id);

  return { journalEntryId, gainLoss };
}

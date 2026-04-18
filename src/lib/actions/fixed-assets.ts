"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/users";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { processMonthlyDepreciation, buildDepreciationPreview } from "@/lib/fixed-assets/depreciation";
import { disposeAsset, type DisposalMethod } from "@/lib/fixed-assets/disposal";
import { can, canManageAccounts, isTenantAdminRole, type UserRole } from "@/lib/auth";
import type { AppRole } from "@/lib/auth/permissions";
import { isFixedAssetChartAccount } from "@/lib/fixed-assets/coa-asset-account";
import { yearsToMonths, validateUsefulLifeYearsInput, computeDefaultDepreciationStart } from "@/lib/fixed-assets/useful-life";
import { listPossibleDuplicateFixedAssets, type DuplicateRow } from "@/lib/fixed-assets/duplicate-assets";
import type { Database } from "@/lib/database.types";
import { listFixedAssetsSummary, type ListFixedAssetsFilter } from "@/lib/data/fixed-assets";

const PeriodSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-01$/),
});

const TransferSchema = z.object({
  assetId: z.string().uuid(),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toLocation: z.string().max(2000).optional().nullable(),
  toAssignedTo: z.string().max(2000).optional().nullable(),
  reason: z.string().min(1),
  notes: z.string().max(2000).optional().nullable(),
});

const DisposeSchema = z.object({
  assetId: z.string().uuid(),
  disposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  proceeds: z.number().min(0),
  method: z.enum(["sold", "scrapped", "donated", "lost", "written_off"]),
  reason: z.string().min(1),
  notes: z.string().optional().nullable(),
  recipientOrBuyer: z.string().optional().nullable(),
});

const ManualAssetSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  cost: z.number().positive(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  usefulLifeYears: z.number().positive(),
  assetAccountId: z.string().uuid(),
  source: z.enum(["manual", "opening_balance"]).default("manual"),
  skipDuplicateCheck: z.boolean().optional(),
});

function canPostOrManage(role: string | null | undefined): boolean {
  return can(role, "post_entry") || canManageAccounts(role as AppRole);
}

export type CreateManualAssetResult =
  | { ok: true; id: string; lifeWarning?: string }
  | { ok: false; code: "DUPLICATES"; duplicates: DuplicateRow[] };

/** Post monthly depreciation; idempotent re-run. */
export async function runMonthlyDepreciationAction(input: z.infer<typeof PeriodSchema>) {
  const payload = PeriodSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  if (!canPostOrManage(user.role as UserRole)) {
    throw new Error("You do not have permission to run depreciation.");
  }
  const result = await processMonthlyDepreciation(payload.periodStart);
  revalidatePath("/fixed-assets");
  revalidatePath("/reports");
  revalidatePath("/reports/pnl");
  revalidatePath("/ledger");
  return { ok: true as const, message: result.message, entriesPosted: result.entriesPosted };
}

export async function previewDepreciationAction(input: z.infer<typeof PeriodSchema>) {
  const payload = PeriodSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  if (!canPostOrManage(user.role as UserRole)) {
    throw new Error("You do not have permission to run depreciation.");
  }
  return buildDepreciationPreview(payload.periodStart);
}

export async function disposeFixedAssetAction(input: z.infer<typeof DisposeSchema>) {
  const payload = DisposeSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  if (!canPostOrManage(user.role as UserRole)) {
    throw new Error("You do not have permission to dispose assets.");
  }

  const result = await disposeAsset({
    assetId: payload.assetId,
    disposalDate: payload.disposalDate,
    proceeds: payload.proceeds,
    method: payload.method as DisposalMethod,
    reason: payload.reason,
    notes: payload.notes ?? null,
    recipientOrBuyer: payload.recipientOrBuyer ?? null,
  });
  revalidatePath("/fixed-assets");
  revalidatePath(`/fixed-assets/${payload.assetId}`);
  revalidatePath("/reports");
  revalidatePath("/reports/pnl");
  revalidatePath("/ledger");
  return result;
}

export async function suggestDuplicateFixedAssetsAction(input: {
  name: string;
  cost: number;
  purchaseDate: string;
}): Promise<DuplicateRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  return listPossibleDuplicateFixedAssets(user.tenant.id, input.name, input.cost, input.purchaseDate);
}

export async function createManualFixedAssetAction(
  input: z.infer<typeof ManualAssetSchema> & { skipDuplicateCheck?: boolean },
): Promise<CreateManualAssetResult> {
  const payload = ManualAssetSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  if (!canPostOrManage(user.role as UserRole)) {
    throw new Error("You do not have permission to create fixed assets.");
  }
  const lifeV = validateUsefulLifeYearsInput(payload.usefulLifeYears);
  if (lifeV.valid === false) throw new Error(lifeV.message);
  if (!payload.skipDuplicateCheck) {
    const dups = await listPossibleDuplicateFixedAssets(
      user.tenant.id,
      payload.name,
      payload.cost,
      payload.purchaseDate,
    );
    if (dups.length) {
      return { ok: false, code: "DUPLICATES", duplicates: dups };
    }
  }

  const supabase = await createServerSupabaseClient();
  const { data: capAccount, error: capErr } = await supabase
    .from("chart_of_accounts")
    .select("id, type, detail_type, tenant_id")
    .eq("id", payload.assetAccountId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (capErr) throw capErr;
  if (!capAccount) {
    throw new Error("Capitalization account not found.");
  }
  if (!isFixedAssetChartAccount(capAccount)) {
    throw new Error(
      "Capitalization account must be a fixed asset (PPE) account in Chart of Accounts — not cash, bank, or expense.",
    );
  }

  const y = new Date(payload.purchaseDate + "T12:00:00").getFullYear();
  const { data: nextCode, error: codeErr } = await (supabase as unknown as { rpc: (n: string, a: { p_tenant_id: string; p_year: number }) => Promise<{ data: string | null; error: { message: string } | null }> }).rpc(
    "next_asset_code",
    { p_tenant_id: user.tenant.id, p_year: y },
  );
  if (codeErr) throw new Error("Failed to reserve asset code: " + codeErr.message);
  if (!nextCode) throw new Error("Failed to reserve asset code");

  const usefulLifeMonths = yearsToMonths(payload.usefulLifeYears);
  const startDep = computeDefaultDepreciationStart(payload.purchaseDate);
  const insert: Database["public"]["Tables"]["fixed_assets"]["Insert"] = {
    tenant_id: user.tenant.id,
    name: payload.name.trim(),
    category: payload.category.trim(),
    cost: payload.cost,
    useful_life_months: usefulLifeMonths,
    residual_value: 0,
    depreciation_method: "straight_line",
    purchase_date: payload.purchaseDate,
    start_depreciation_date: startDep,
    is_active: true,
    description: null,
    asset_account_id: payload.assetAccountId,
    asset_code: nextCode,
    source_type: payload.source,
  };

  const { data, error } = await supabase.from("fixed_assets").insert(insert).select("id").single();
  if (error) throw error;
  revalidatePath("/fixed-assets");
  return {
    ok: true,
    id: data.id as string,
    lifeWarning: lifeV.valid && "warning" in lifeV ? lifeV.warning : undefined,
  };
}

export async function transferFixedAssetAction(input: z.infer<typeof TransferSchema>) {
  const p = TransferSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  if (!canPostOrManage(user.role as UserRole)) {
    throw new Error("You do not have permission to transfer assets.");
  }
  const supabase = await createServerSupabaseClient();
  const { data: row, error: aErr } = await supabase
    .from("fixed_assets")
    .select("id, location, assigned_to, tenant_id, disposed_at")
    .eq("id", p.assetId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!row || row.disposed_at) throw new Error("Asset not found or disposed.");
  const { error: tErr } = await supabase.from("fixed_asset_transfers").insert({
    tenant_id: user.tenant.id,
    asset_id: p.assetId,
    transfer_date: p.transferDate,
    to_location: p.toLocation?.trim() || null,
    to_assigned_to: p.toAssignedTo?.trim() || null,
    from_location: row.location,
    from_assigned_to: row.assigned_to,
    reason: p.reason.trim(),
    notes: p.notes?.trim() || null,
    created_by: user.id,
  });
  if (tErr) throw tErr;
  await supabase
    .from("fixed_assets")
    .update({
      location: p.toLocation?.trim() || null,
      assigned_to: p.toAssignedTo?.trim() || null,
    })
    .eq("id", p.assetId)
    .eq("tenant_id", user.tenant.id);
  revalidatePath("/fixed-assets");
  revalidatePath(`/fixed-assets/${p.assetId}`);
  return { ok: true as const };
}

/**
 * For admin+ Excel export. Returns a plain row matrix for the client to write as xlsx.
 */
export async function getRegisterExportRowsForTenant(input: {
  status: "active" | "disposed" | "all";
} & ListFixedAssetsFilter) {
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  if (!isTenantAdminRole(user.role as UserRole)) {
    throw new Error("Only administrators can export the register to Excel.");
  }
  const { getTenantBaseCurrency } = await import("@/lib/utils/currency-conversion");
  const { status, ...rest } = input;
  const [rows, displayCurrency] = await Promise.all([
    listFixedAssetsSummary(status, rest),
    getTenantBaseCurrency(user.tenant.id),
  ]);
  return {
    displayCurrency,
    rows: rows.map((r) => ({
      code: r.asset_code ?? "",
      name: r.name ?? "",
      category: r.category ?? "",
      cost: r.cost,
      accDep: r.accumulated_depreciation,
      nbv: r.net_book_value,
      purchase: r.purchase_date,
      location: r.location ?? "",
      assignee: r.assigned_to ?? "",
      source: r.source_type ?? "manual",
      status: r.disposed_at ? "disposed" : "active",
    })),
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/users";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { processMonthlyDepreciation } from "@/lib/fixed-assets/depreciation";
import { disposeAsset } from "@/lib/fixed-assets/disposal";
import { canManageAccounts, type UserRole } from "@/lib/auth";

const PeriodSchema = z.object({
  /** First day of month YYYY-MM-01 */
  periodStart: z.string().regex(/^\d{4}-\d{2}-01$/),
});

const DisposeSchema = z.object({
  assetId: z.string().uuid(),
  disposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  proceeds: z.number().min(0),
  description: z.string().optional(),
});

const ManualAssetSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  cost: z.number().positive(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  usefulLifeMonths: z.number().int().min(1),
  assetAccountId: z.string().uuid(),
});

/** Post monthly depreciation journals for all active assets (idempotent per period). */
export async function runMonthlyDepreciationAction(input: z.infer<typeof PeriodSchema>) {
  const payload = PeriodSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");

  await processMonthlyDepreciation(payload.periodStart);

  revalidatePath("/fixed-assets");
  revalidatePath("/reports/pnl");
  revalidatePath("/ledger");
  return { ok: true as const };
}

export async function disposeFixedAssetAction(input: z.infer<typeof DisposeSchema>) {
  const payload = DisposeSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only administrators and accountants can dispose assets.");
  }

  const result = await disposeAsset(payload.assetId, payload.disposalDate, payload.proceeds, payload.description);

  revalidatePath("/fixed-assets");
  revalidatePath(`/fixed-assets/${payload.assetId}`);
  revalidatePath("/reports/pnl");
  revalidatePath("/ledger");
  return result;
}

/** Manual register entry (no purchase journal — use when capitalizing outside a bill). */
export async function createManualFixedAssetAction(input: z.infer<typeof ManualAssetSchema>) {
  const payload = ManualAssetSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only administrators and accountants can create fixed assets.");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("fixed_assets")
    .insert({
      tenant_id: user.tenant.id,
      name: payload.name.trim(),
      category: payload.category.trim(),
      cost: payload.cost,
      useful_life_months: payload.usefulLifeMonths,
      residual_value: 0,
      depreciation_method: "straight_line",
      purchase_date: payload.purchaseDate,
      start_depreciation_date: payload.purchaseDate,
      is_active: true,
      description: null,
      asset_account_id: payload.assetAccountId,
    })
    .select("id")
    .single();

  if (error) throw error;

  revalidatePath("/fixed-assets");
  return { id: data.id as string };
}

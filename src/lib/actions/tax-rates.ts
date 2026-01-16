"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Tax rate type definition (moved from data file to avoid server imports in client components)
export interface TaxRate {
  id: string;
  tenant_id: string;
  name: string;
  percentage: number;
  tax_type: "input" | "output";
  output_vat_account_id: string | null;
  input_vat_account_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CreateTaxRateSchema = z.object({
  name: z.string().min(1, "Tax rate name is required"),
  percentage: z.number().min(0).max(100),
  tax_type: z.enum(["input", "output"]),
  output_vat_account_id: z.string().uuid().optional().nullable(),
  input_vat_account_id: z.string().uuid().optional().nullable(),
});

const UpdateTaxRateSchema = CreateTaxRateSchema.extend({
  id: z.string().uuid(),
  is_active: z.boolean().optional(),
});

export async function listTaxRatesAction(): Promise<TaxRate[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  // Use type assertion since tax_rates table may not be in generated types yet
  const { data, error } = await (supabase.from("tax_rates" as any) as any)
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load tax rates", error);
    throw error;
  }

  return (data ?? []).map((rate: any) => ({
    ...rate,
    percentage: Number(rate.percentage),
  }));
}

export async function createTaxRateAction(
  input: z.infer<typeof CreateTaxRateSchema>
) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const payload = CreateTaxRateSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  // Check if tax rate with same name already exists
  // Use type assertion since tax_rates table may not be in generated types yet
  const { data: existing } = await (supabase.from("tax_rates" as any) as any)
    .select("id")
    .eq("tenant_id", user.tenant.id)
    .eq("name", payload.name)
    .maybeSingle();

  if (existing) {
    throw new Error(`A tax rate named "${payload.name}" already exists.`);
  }

  // Use type assertion since tax_rates table may not be in generated types yet
  const { data, error } = await (supabase.from("tax_rates" as any) as any)
    .insert({
      tenant_id: user.tenant.id,
      name: payload.name,
      percentage: payload.percentage,
      tax_type: payload.tax_type,
      output_vat_account_id: payload.output_vat_account_id,
      input_vat_account_id: payload.input_vat_account_id,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create tax rate", error);
    throw error;
  }

  revalidatePath("/settings");
  return data;
}

export async function updateTaxRateAction(
  input: z.infer<typeof UpdateTaxRateSchema>
) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const payload = UpdateTaxRateSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  // Verify tax rate belongs to tenant
  // Use type assertion since tax_rates table may not be in generated types yet
  const { data: existing } = await (supabase.from("tax_rates" as any) as any)
    .select("id")
    .eq("id", payload.id)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (!existing) {
    throw new Error("Tax rate not found.");
  }

    // Check if name change conflicts with existing tax rate
    if (payload.name) {
      const { data: nameConflict } = await (supabase.from("tax_rates" as any) as any)
        .select("id")
        .eq("tenant_id", user.tenant.id)
        .eq("name", payload.name)
        .neq("id", payload.id)
        .maybeSingle();

    if (nameConflict) {
      throw new Error(`A tax rate named "${payload.name}" already exists.`);
    }
  }

  // Use type assertion since tax_rates table may not be in generated types yet
  const { data, error } = await (supabase.from("tax_rates" as any) as any)
    .update({
      name: payload.name,
      percentage: payload.percentage,
      tax_type: payload.tax_type,
      output_vat_account_id: payload.output_vat_account_id,
      input_vat_account_id: payload.input_vat_account_id,
      is_active: payload.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.id)
    .eq("tenant_id", user.tenant.id)
    .select()
    .single();

  if (error) {
    console.error("Failed to update tax rate", error);
    throw error;
  }

  revalidatePath("/settings");
  return data;
}

export async function deleteTaxRateAction(id: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();

  // Soft delete by setting is_active to false
  // Use type assertion since tax_rates table may not be in generated types yet
  const { error } = await (supabase.from("tax_rates" as any) as any)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenant.id);

  if (error) {
    console.error("Failed to delete tax rate", error);
    throw error;
  }

  revalidatePath("/settings");
}

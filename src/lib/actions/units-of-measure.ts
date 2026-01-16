"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Unit of measure type definition (moved from data file to avoid server imports in client components)
export interface UnitOfMeasure {
  id: string;
  tenant_id: string;
  name: string;
  abbreviation: string;
  category: "weight" | "volume" | "length" | "count" | "other";
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

const CreateUOMSchema = z.object({
  name: z.string().min(1, "Unit name is required"),
  abbreviation: z.string().min(1, "Abbreviation is required"),
  category: z.enum(["weight", "volume", "length", "count", "other"]),
});

const UpdateUOMSchema = CreateUOMSchema.extend({
  id: z.string().uuid(),
  is_active: z.boolean().optional(),
});

export async function listUnitsOfMeasureAction(): Promise<UnitOfMeasure[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  // Use type assertion since units_of_measure table may not be in generated types yet
  const { data, error } = await (supabase.from("units_of_measure" as any) as any)
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load units of measure", error);
    throw error;
  }

  return (data ?? []) as UnitOfMeasure[];
}

export async function createUnitOfMeasureAction(
  input: z.infer<typeof CreateUOMSchema>
) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const payload = CreateUOMSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  // Check if UOM with same abbreviation already exists
  // Use type assertion since units_of_measure table may not be in generated types yet
  const { data: existing } = await (supabase.from("units_of_measure" as any) as any)
    .select("id")
    .eq("tenant_id", user.tenant.id)
    .eq("abbreviation", payload.abbreviation)
    .maybeSingle();

  if (existing) {
    throw new Error(`A unit with abbreviation "${payload.abbreviation}" already exists.`);
  }

  // Use type assertion since units_of_measure table may not be in generated types yet
  const { data, error } = await (supabase.from("units_of_measure" as any) as any)
    .insert({
      tenant_id: user.tenant.id,
      name: payload.name,
      abbreviation: payload.abbreviation,
      category: payload.category,
      is_active: true,
      is_system: false,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create unit of measure", error);
    throw error;
  }

  revalidatePath("/settings");
  return data;
}

export async function updateUnitOfMeasureAction(
  input: z.infer<typeof UpdateUOMSchema>
) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const payload = UpdateUOMSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  // Verify UOM belongs to tenant
  // Use type assertion since units_of_measure table may not be in generated types yet
  const { data: existing } = await (supabase.from("units_of_measure" as any) as any)
    .select("id, is_system")
    .eq("id", payload.id)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (!existing) {
    throw new Error("Unit of measure not found.");
  }

  // Check if abbreviation change conflicts with existing UOM
  if (payload.abbreviation) {
    const { data: abbrevConflict } = await (supabase.from("units_of_measure" as any) as any)
      .select("id")
      .eq("tenant_id", user.tenant.id)
      .eq("abbreviation", payload.abbreviation)
      .neq("id", payload.id)
      .maybeSingle();

    if (abbrevConflict) {
      throw new Error(`A unit with abbreviation "${payload.abbreviation}" already exists.`);
    }
  }

  // Use type assertion since units_of_measure table may not be in generated types yet
  const { data, error } = await (supabase.from("units_of_measure" as any) as any)
    .update({
      name: payload.name,
      abbreviation: payload.abbreviation,
      category: payload.category,
      is_active: payload.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.id)
    .eq("tenant_id", user.tenant.id)
    .select()
    .single();

  if (error) {
    console.error("Failed to update unit of measure", error);
    throw error;
  }

  revalidatePath("/settings");
  return data;
}

export async function deleteUnitOfMeasureAction(id: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();

  // Check if it's a system unit (cannot be deleted)
  // Use type assertion since units_of_measure table may not be in generated types yet
  const { data: existing } = await (supabase.from("units_of_measure" as any) as any)
    .select("is_system")
    .eq("id", id)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (existing?.is_system) {
    throw new Error("System units cannot be deleted. You can deactivate them instead.");
  }

  // Soft delete by setting is_active to false
  // Use type assertion since units_of_measure table may not be in generated types yet
  const { error } = await (supabase.from("units_of_measure" as any) as any)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenant.id);

  if (error) {
    console.error("Failed to delete unit of measure", error);
    throw error;
  }

  revalidatePath("/settings");
}

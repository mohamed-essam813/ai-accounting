import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";

// Units of Measure table may not be in generated types yet, use type assertion
type UOMRow = {
  id: string;
  tenant_id: string;
  name: string;
  abbreviation: string;
  category: "weight" | "volume" | "length" | "count" | "other";
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

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

export async function listUnitsOfMeasure(): Promise<UnitOfMeasure[]> {
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

export async function getUnitOfMeasureById(id: string): Promise<UnitOfMeasure | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  // Use type assertion since units_of_measure table may not be in generated types yet
  const { data, error } = await (supabase.from("units_of_measure" as any) as any)
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load unit of measure", error);
    throw error;
  }

  if (!data) return null;

  return data as UnitOfMeasure;
}

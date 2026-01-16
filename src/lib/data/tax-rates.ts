import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";

// Tax rates table may not be in generated types yet, use type assertion
type TaxRatesRow = {
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
};

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

export async function listTaxRates(): Promise<TaxRate[]> {
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

  return (data ?? []).map((rate: TaxRatesRow) => ({
    ...rate,
    percentage: Number(rate.percentage),
  }));
}

export async function getTaxRateById(id: string): Promise<TaxRate | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  // Use type assertion since tax_rates table may not be in generated types yet
  const { data, error } = await (supabase.from("tax_rates" as any) as any)
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load tax rate", error);
    throw error;
  }

  if (!data) return null;

  return {
    ...(data as TaxRatesRow),
    percentage: Number((data as TaxRatesRow).percentage),
  };
}

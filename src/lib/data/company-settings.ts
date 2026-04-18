import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "../database.types";

export type CompanySettingsRow = Database["public"]["Tables"]["company_settings"]["Row"];
export type UsefulLifeDefaultRow = Database["public"]["Tables"]["useful_life_defaults"]["Row"];

const DEFAULT_USEFUL_LIFE: { category: string; life_years: number }[] = [
  { category: "Computers & IT", life_years: 3 },
  { category: "Furniture & Fixtures", life_years: 5 },
  { category: "Vehicles", life_years: 5 },
  { category: "Office Equipment", life_years: 5 },
  { category: "Machinery", life_years: 10 },
  { category: "Buildings", life_years: 25 },
];

/**
 * Ensures a company_settings row and useful_life_defaults seeds exist for the tenant.
 */
export async function ensureCompanySettings(tenantId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("company_settings")
    .select("tenant_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existing) {
    const { data: lifeRows } = await supabase
      .from("useful_life_defaults")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1);
    if (!lifeRows?.length) {
      await supabase.from("useful_life_defaults").insert(
        DEFAULT_USEFUL_LIFE.map((r) => ({
          tenant_id: tenantId,
          category: r.category,
          life_years: r.life_years,
        })),
      );
    }
    return;
  }

  const { data: tenant, error: tErr } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tenant) return;

  const name = (tenant.legal_name?.trim() || tenant.name || "").trim() || "Company";
  const { error: insErr } = await supabase.from("company_settings").insert({
    tenant_id: tenantId,
    company_name: name,
    registered_address: tenant.address,
    logo_url: tenant.logo_url,
    country: tenant.country?.trim() || "AE",
    trn: tenant.tax_registration_number,
    fiscal_year_start_month: tenant.fiscal_year_start_month ?? 1,
    base_currency: tenant.base_currency,
  });
  if (insErr) throw insErr;

  await supabase.from("useful_life_defaults").insert(
    DEFAULT_USEFUL_LIFE.map((r) => ({
      tenant_id: tenantId,
      category: r.category,
      life_years: r.life_years,
    })),
  );
}

export async function getCompanySettings(): Promise<CompanySettingsRow | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) return null;
  await ensureCompanySettings(user.tenant.id);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listUsefulLifeDefaults(): Promise<UsefulLifeDefaultRow[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];
  await ensureCompanySettings(user.tenant.id);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("useful_life_defaults")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("category");
  if (error) throw error;
  return data ?? [];
}

/** Used by prompts / classification — numeric AED threshold from company settings. */
export async function getCapitalizationThresholdAed(): Promise<number> {
  const row = await getCompanySettings();
  if (!row) return 1000;
  return Number(row.capitalization_threshold);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts, type UserRole } from "@/lib/auth";
import type { Database, Json } from "@/lib/database.types";
import { ensureCompanySettings } from "@/lib/data/company-settings";

type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];
type CompanySettingsUpdate = Database["public"]["Tables"]["company_settings"]["Update"];

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");
  if (!canManageAccounts(user.role as UserRole)) throw new Error("Only admins can update company settings.");
  return user as typeof user & { tenant: NonNullable<typeof user.tenant> };
}

async function hasInventoryTransactions(tenantId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("inventory_transactions" as any)
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function syncTenantCore(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  tenantId: string,
  patch: {
    name?: string;
    legal_name?: string | null;
    address?: string | null;
    logo_url?: string | null;
    country?: string | null;
    tax_registration_number?: string | null;
    fiscal_year_start_month?: number | null;
    base_currency?: string;
  },
) {
  type TenantsUpdate = Database["public"]["Tables"]["tenants"]["Update"];
  const table = supabase.from("tenants") as unknown as {
    update: (values: TenantsUpdate) => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>;
    };
  };
  const { error } = await table.update(patch).eq("id", tenantId);
  if (error) throw error;
}

const CompanyProfileSchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  trade_license_number: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  registered_address: z.string().nullable().optional(),
  home_emirate: z
    .union([
      z.enum(["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "UAQ", "RAK", "Fujairah"]),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
  country: z.string().min(2, "Country is required"),
  phone: z.string().nullable().optional(),
  email: z.union([z.string().email(), z.literal("")]).optional().nullable(),
  website: z.union([z.string().url(), z.literal("")]).optional().nullable(),
  industry: z.string().nullable().optional(),
});

export async function saveCompanyProfileSectionAction(input: z.infer<typeof CompanyProfileSchema>) {
  const user = await requireAdminUser();
  const payload = CompanyProfileSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  await ensureCompanySettings(user.tenant.id);

  const email =
    payload.email === "" || payload.email == null ? null : payload.email;
  const website =
    payload.website === "" || payload.website == null ? null : payload.website;

  const update: CompanySettingsUpdate = {
    company_name: payload.company_name.trim(),
    trade_license_number: payload.trade_license_number?.trim() || null,
    logo_url: payload.logo_url ?? null,
    registered_address: payload.registered_address?.trim() || null,
    home_emirate: payload.home_emirate ?? null,
    country: payload.country.trim(),
    phone: payload.phone?.trim() || null,
    email,
    website,
    industry: payload.industry?.trim() || null,
  };

  const { error } = await supabase.from("company_settings").update(update).eq("tenant_id", user.tenant.id);
  if (error) throw error;

  await syncTenantCore(supabase, user.tenant.id, {
    name: update.company_name!,
    legal_name: update.company_name!,
    address: update.registered_address ?? null,
    logo_url: update.logo_url ?? null,
    country: update.country ?? null,
  });

  await insertAudit(supabase, user.tenant.id, user.id, "company_settings.profile", update);
  revalidatePath("/settings");
  revalidatePath("/settings/tenant");
  revalidatePath("/dashboard");
}

const TaxSectionSchema = z
  .object({
    vat_registered: z.boolean(),
    trn: z.string().nullable().optional(),
    vat_effective_date: z.string().nullable().optional(),
    vat_filing_frequency: z.enum(["monthly", "quarterly"]),
    first_vat_period_start: z.string().nullable().optional(),
    reverse_charge_enabled: z.boolean(),
    zero_rated_categories: z.array(z.string()),
    exempt_categories: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    if (data.vat_registered) {
      if (!data.trn || !/^\d{15}$/.test(data.trn.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "TRN is required and must be 15 digits when VAT registered",
          path: ["trn"],
        });
      }
    }
  });

export async function saveTaxSectionAction(input: z.infer<typeof TaxSectionSchema>) {
  const user = await requireAdminUser();
  const payload = TaxSectionSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  await ensureCompanySettings(user.tenant.id);

  const trn = payload.vat_registered ? payload.trn!.trim() : null;

  const update: CompanySettingsUpdate = {
    vat_registered: payload.vat_registered,
    trn,
    vat_effective_date: payload.vat_effective_date || null,
    vat_filing_frequency: payload.vat_filing_frequency,
    first_vat_period_start: payload.first_vat_period_start || null,
    reverse_charge_enabled: payload.reverse_charge_enabled,
    zero_rated_categories: payload.zero_rated_categories,
    exempt_categories: payload.exempt_categories,
  };

  const { error } = await supabase.from("company_settings").update(update).eq("tenant_id", user.tenant.id);
  if (error) throw error;

  await syncTenantCore(supabase, user.tenant.id, {
    tax_registration_number: trn,
  });

  await insertAudit(supabase, user.tenant.id, user.id, "company_settings.tax", update);
  revalidatePath("/settings");
  revalidatePath("/settings/tenant");
}

const InventoryValuationSchema = z.enum(["fifo", "weighted_average", "specific_identification"]);

const AccountingSectionSchema = z.object({
  fiscal_year_start_month: z.number().min(1).max(12),
  base_currency: z.string().min(3).max(3),
  currency_symbol_position: z.enum(["prefix", "suffix"]),
  currency_decimal_separator: z.string().min(1).max(1),
  currency_thousand_separator: z.string().min(1).max(1),
  inventory_valuation_method: InventoryValuationSchema,
  allow_negative_stock: z.boolean(),
  default_warehouse_id: z.string().uuid().nullable().optional(),
  capitalization_threshold: z.number().positive(),
  default_depreciation_method: z.enum(["straight_line", "reducing_balance"]),
  deferred_revenue_account_code: z.string().min(1),
  month_end_recognition_day: z.enum(["first_of_next", "last_of_current"]),
  auto_run_month_end_recognition: z.boolean(),
  useful_life_rows: z.array(
    z.object({
      id: z.string().uuid(),
      category: z.string().min(1),
      life_years: z.number().min(1).max(100),
    }),
  ),
});

export async function saveAccountingSectionAction(input: z.infer<typeof AccountingSectionSchema>) {
  const user = await requireAdminUser();
  const payload = AccountingSectionSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  await ensureCompanySettings(user.tenant.id);

  const { data: currentSettings } = await supabase
    .from("company_settings")
    .select("inventory_valuation_method, base_currency")
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  const hadTx = await hasInventoryTransactions(user.tenant.id);
  const prevVal = (currentSettings as { inventory_valuation_method?: string } | null)?.inventory_valuation_method;
  if (
    hadTx &&
    prevVal &&
    prevVal !== payload.inventory_valuation_method
  ) {
    throw new Error(
      "Cannot change inventory valuation method after inventory transactions exist.",
    );
  }

  // Deferred revenue account must exist as liability
  const code = payload.deferred_revenue_account_code.trim();
  const { data: accRow } = await supabase
    .from("chart_of_accounts")
    .select("id, type")
    .eq("tenant_id", user.tenant.id)
    .eq("code", code)
    .maybeSingle();
  if (!accRow || accRow.type !== "liability") {
    throw new Error(
      `Deferred revenue account code ${code} must exist in Chart of Accounts with type Liability.`,
    );
  }

  const csUpdate: CompanySettingsUpdate = {
    fiscal_year_start_month: payload.fiscal_year_start_month,
    base_currency: payload.base_currency.toUpperCase(),
    currency_symbol_position: payload.currency_symbol_position,
    currency_decimal_separator: payload.currency_decimal_separator,
    currency_thousand_separator: payload.currency_thousand_separator,
    inventory_valuation_method: payload.inventory_valuation_method,
    allow_negative_stock: payload.allow_negative_stock,
    default_warehouse_id: payload.default_warehouse_id ?? null,
    capitalization_threshold: payload.capitalization_threshold,
    default_depreciation_method: payload.default_depreciation_method,
    deferred_revenue_account_code: code,
    month_end_recognition_day: payload.month_end_recognition_day,
    auto_run_month_end_recognition: payload.auto_run_month_end_recognition,
  };

  const { error: csErr } = await supabase.from("company_settings").update(csUpdate).eq("tenant_id", user.tenant.id);
  if (csErr) throw csErr;

  await syncTenantCore(supabase, user.tenant.id, {
    fiscal_year_start_month: payload.fiscal_year_start_month,
    base_currency: csUpdate.base_currency!,
  });

  // Mirror valuation into accounting_policies for inventory engine
  const policyMethod =
    payload.inventory_valuation_method === "specific_identification"
      ? "specific_identification"
      : payload.inventory_valuation_method;
  const { error: polErr } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("accounting_policies" as any)
    .update({
      inventory_valuation_method: policyMethod,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", user.tenant.id);
  if (polErr) throw polErr;

  for (const row of payload.useful_life_rows) {
    const { error: uErr } = await supabase
      .from("useful_life_defaults")
      .update({ category: row.category, life_years: row.life_years })
      .eq("id", row.id)
      .eq("tenant_id", user.tenant.id);
    if (uErr) throw uErr;
  }

  await insertAudit(supabase, user.tenant.id, user.id, "company_settings.accounting", csUpdate);
  revalidatePath("/settings");
  revalidatePath("/settings/tenant");
  revalidatePath("/prompt");
  revalidatePath("/inventory");
  revalidatePath("/reports");
}

const ApprovalSectionSchema = z.object({
  require_approval_before_posting: z.boolean(),
  minimum_approvers: z.number().min(1).max(3),
  approval_amount_threshold: z.number().nullable().optional(),
  auto_notify_drafter_on_approval: z.boolean(),
});

export async function saveApprovalSectionAction(input: z.infer<typeof ApprovalSectionSchema>) {
  const user = await requireAdminUser();
  const payload = ApprovalSectionSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  await ensureCompanySettings(user.tenant.id);

  const update: CompanySettingsUpdate = {
    require_approval_before_posting: payload.require_approval_before_posting,
    minimum_approvers: payload.minimum_approvers,
    approval_amount_threshold: payload.approval_amount_threshold ?? null,
    auto_notify_drafter_on_approval: payload.auto_notify_drafter_on_approval,
  };

  const { error } = await supabase.from("company_settings").update(update).eq("tenant_id", user.tenant.id);
  if (error) throw error;

  await insertAudit(supabase, user.tenant.id, user.id, "company_settings.approval", update);
  revalidatePath("/settings");
}

const ReportsSectionSchema = z.object({
  default_comparison_period: z.enum(["prior_period", "prior_year", "none"]),
  default_date_range: z.enum(["this_month", "this_quarter", "ytd"]),
  hide_rows_under_amount: z.number().min(0),
  material_change_absolute: z.number().min(0),
  material_change_percentage: z.number().min(0).max(100),
  default_pl_revenue_view: z.enum(["recognized", "billed", "cash_collected"]),
  show_gross_margin_percent: z.boolean(),
  show_net_margin_percent: z.boolean(),
});

export async function saveReportsSectionAction(input: z.infer<typeof ReportsSectionSchema>) {
  const user = await requireAdminUser();
  const payload = ReportsSectionSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  await ensureCompanySettings(user.tenant.id);

  const update: CompanySettingsUpdate = {
    default_comparison_period: payload.default_comparison_period,
    default_date_range: payload.default_date_range,
    hide_rows_under_amount: payload.hide_rows_under_amount,
    material_change_absolute: payload.material_change_absolute,
    material_change_percentage: payload.material_change_percentage,
    default_pl_revenue_view: payload.default_pl_revenue_view,
    show_gross_margin_percent: payload.show_gross_margin_percent,
    show_net_margin_percent: payload.show_net_margin_percent,
  };

  const { error } = await supabase.from("company_settings").update(update).eq("tenant_id", user.tenant.id);
  if (error) throw error;

  await insertAudit(supabase, user.tenant.id, user.id, "company_settings.reports", update);
  revalidatePath("/settings");
  revalidatePath("/reports");
}

async function insertAudit(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  tenantId: string,
  actorId: string,
  action: string,
  changes: unknown,
) {
  const auditData: AuditLogsInsert = {
    tenant_id: tenantId,
    actor_id: actorId,
    action,
    entity: "company_settings",
    entity_id: tenantId,
    changes: changes as Json,
  };
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);
}

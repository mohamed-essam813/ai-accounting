"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts, type UserRole } from "@/lib/auth";
import type { Database } from "@/lib/database.types";

type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

const TenantSchema = z.object({
  name: z.string().min(2),
});

export async function updateTenantProfileAction(input: z.infer<typeof TenantSchema>) {
  const payload = TenantSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only admins can update tenant profile.");
  }

  const supabase = await createServerSupabaseClient();
  // Type assertion to fix Supabase type inference
  type TenantsUpdate = Database["public"]["Tables"]["tenants"]["Update"];
  const table = supabase.from("tenants") as unknown as {
    update: (values: TenantsUpdate) => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>;
    };
  };
  const { error } = await table.update({ name: payload.name }).eq("id", user.tenant.id);

  if (error) throw error;

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "tenant.updated",
    entity: "tenants",
    entity_id: user.tenant.id,
    changes: payload,
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/settings/tenant");
  revalidatePath("/dashboard");
}

const BaseCurrencySchema = z.object({
  base_currency: z.string().min(3),
});

export async function updateTenantBaseCurrencyAction(
  input: z.infer<typeof BaseCurrencySchema>
) {
  const payload = BaseCurrencySchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only admins can update base currency.");
  }

  const supabase = await createServerSupabaseClient();

  // Get current base currency for audit log
  const { data: currentTenant } = await supabase
    .from("tenants")
    .select("base_currency")
    .eq("id", user.tenant.id)
    .maybeSingle();

  const oldBaseCurrency = (currentTenant as any)?.base_currency as string | undefined;

  // Update base currency
  // Using type assertion since base_currency may not be in generated types yet
  const { error } = await (supabase.from("tenants") as any)
    .update({ base_currency: payload.base_currency })
    .eq("id", user.tenant.id);

  if (error) throw error;

  // Audit log
  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "tenant.base_currency_updated",
    entity: "tenants",
    entity_id: user.tenant.id,
    changes: {
      old_base_currency: oldBaseCurrency,
      new_base_currency: payload.base_currency,
    },
  };
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/settings/tenant");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/ledger");
  revalidatePath("/drafts");
}

const PeriodCloseSchema = z.object({
  accounting_period_closed_through: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
});

export async function updateAccountingPeriodCloseAction(
  input: z.infer<typeof PeriodCloseSchema>,
) {
  const payload = PeriodCloseSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only admins can change period close settings.");
  }

  const supabase = await createServerSupabaseClient();
  type TenantsUpdate = Database["public"]["Tables"]["tenants"]["Update"];
  const table = supabase.from("tenants") as unknown as {
    update: (values: TenantsUpdate) => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>;
    };
  };
  const { error } = await table
    .update({ accounting_period_closed_through: payload.accounting_period_closed_through })
    .eq("id", user.tenant.id);

  if (error) throw error;

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "tenant.period_close_updated",
    entity: "tenants",
    entity_id: user.tenant.id,
    changes: { accounting_period_closed_through: payload.accounting_period_closed_through },
  };
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/settings/tenant");
  revalidatePath("/timeline");
}

const CompanyDetailsSchema = z.object({
  country: z.string().nullable(),
  fiscal_year_start_month: z.number().min(1).max(12).nullable(),
  tax_registration_number: z.string().nullable(),
});

export async function updateTenantCompanyDetailsAction(
  input: z.infer<typeof CompanyDetailsSchema>,
) {
  const payload = CompanyDetailsSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only admins can update company details.");
  }

  const supabase = await createServerSupabaseClient();
  type TenantsUpdate = Database["public"]["Tables"]["tenants"]["Update"];
  const table = supabase.from("tenants") as unknown as {
    update: (values: TenantsUpdate) => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>;
    };
  };
  const { error } = await table
    .update({
      country: payload.country,
      fiscal_year_start_month: payload.fiscal_year_start_month,
      tax_registration_number: payload.tax_registration_number,
    })
    .eq("id", user.tenant.id);

  if (error) throw error;

  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<{ error: unknown }> }).insert([
    {
      tenant_id: user.tenant.id,
      actor_id: user.id,
      action: "tenant.company_details_updated",
      entity: "tenants",
      entity_id: user.tenant.id,
      changes: {
        country: payload.country,
        fiscal_year_start_month: payload.fiscal_year_start_month,
        tax_registration_number: payload.tax_registration_number,
      },
    },
  ]);

  revalidatePath("/settings/tenant");
}


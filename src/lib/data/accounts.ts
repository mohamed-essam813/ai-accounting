import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";
import { dedupeEntitiesForDisplay, normalizeEntityName } from "@/lib/utils/entity-dedupe";
import { isReportingClassification, type ReportingClassification } from "@/lib/accounting/reporting-classification";

type ChartOfAccountsRow = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

type CoaSeed = Database["public"]["Tables"]["chart_of_accounts"]["Insert"] & {
  category?: "current" | "non_current" | null;
  account_classification?: string | null;
};

function enrichSeedCoaRow(a: CoaSeed, tenantId: string): Record<string, unknown> {
  const standardized_name = a.name;
  const normalized_name = normalizeEntityName(a.name);
  let reporting_classification: ReportingClassification | null = null;
  const code = a.code;
  if (code === "1150") {
    reporting_classification = "tax_input";
  } else if (code === "2100") {
    reporting_classification = "tax_output";
  } else if (a.type === "revenue" || a.type === "expense") {
    const ac = a.account_classification;
    if (ac && isReportingClassification(ac)) {
      reporting_classification = ac;
    }
  } else if (a.type === "equity") {
    reporting_classification = "equity";
  } else if (a.type === "asset") {
    reporting_classification = a.category === "non_current" ? "asset_non_current" : "asset_current";
  } else if (a.type === "liability") {
    reporting_classification = a.category === "non_current" ? "liability_non_current" : "liability_current";
  }
  return {
    ...a,
    tenant_id: tenantId,
    standardized_name,
    normalized_name,
    ...(reporting_classification ? { reporting_classification } : {}),
    is_system_standard: true,
    is_custom: false,
  };
}

export async function listAccounts() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  // Select all columns (category may not exist if migration hasn't run yet)
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("code");

  if (error) {
    console.error("Failed to load accounts", error);
    throw error;
  }

  // Map to ensure category is included (may be null if migration hasn't run)
  const mapped = (data ?? []).map((acc) => {
    const account = acc as unknown as ChartOfAccountsRow & {
      category?: "current" | "non_current" | null;
      standardized_name?: string | null;
      normalized_name?: string | null;
      reporting_classification?: string | null;
      is_system_standard?: boolean | null;
      is_custom?: boolean | null;
    };
    return {
      id: account.id,
      name: account.name,
      code: account.code,
      type: account.type,
      category: account.category ?? null,
      is_active: account.is_active,
      tenant_id: account.tenant_id,
      created_at: account.created_at,
      detail_type: account.detail_type ?? null,
      allow_reconciliation: account.allow_reconciliation ?? false,
      prd_account_kind: account.prd_account_kind ?? null,
      account_classification: account.account_classification ?? null,
      standardized_name: account.standardized_name ?? null,
      normalized_name: account.normalized_name ?? null,
      reporting_classification: account.reporting_classification ?? null,
      is_system_standard: account.is_system_standard ?? false,
      is_custom: account.is_custom ?? true,
    };
  });
  return dedupeEntitiesForDisplay(mapped as unknown as Record<string, unknown>[], {
    idKey: "id",
    entityLabel: "chart-of-accounts",
  }) as typeof mapped;
}

export async function getAccountByCode(code: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("code", code)
    .maybeSingle();

  return data ?? null;
}

/**
 * Ensure default accounts exist for a tenant
 * Creates the standard chart of accounts if they don't exist
 */
export async function ensureDefaultAccounts(tenantId: string) {
  const supabase = await createServerSupabaseClient();

  const defaultAccounts: CoaSeed[] = [
    // ASSETS — current
    { code: "1000", name: "Cash", type: "asset", tenant_id: tenantId, category: "current" },
    { code: "1010", name: "Bank Accounts", type: "asset", tenant_id: tenantId, category: "current" },
    { code: "1100", name: "Accounts Receivable", type: "asset", tenant_id: tenantId, category: "current" },
    { code: "1150", name: "VAT Recoverable", type: "asset", tenant_id: tenantId, category: "current" },
    { code: "1200", name: "Inventory", type: "asset", tenant_id: tenantId, category: "current" },
    { code: "1300", name: "Prepaid Expenses", type: "asset", tenant_id: tenantId, category: "current" },
    { code: "1350", name: "Other Receivables", type: "asset", tenant_id: tenantId, category: "current" },
    { code: "1400", name: "Other Current Assets", type: "asset", tenant_id: tenantId, category: "current" },
    // ASSETS — non-current
    { code: "1500", name: "Property, Plant & Equipment", type: "asset", tenant_id: tenantId, category: "non_current" },
    { code: "1600", name: "Accumulated Depreciation", type: "asset", tenant_id: tenantId, category: "non_current" },
    { code: "1700", name: "Intangible Assets", type: "asset", tenant_id: tenantId, category: "non_current" },
    { code: "1800", name: "Long-term Investments", type: "asset", tenant_id: tenantId, category: "non_current" },

    // LIABILITIES — current
    { code: "2000", name: "Accounts Payable", type: "liability", tenant_id: tenantId, category: "current" },
    { code: "2100", name: "VAT Payable", type: "liability", tenant_id: tenantId, category: "current" },
    { code: "2200", name: "Accrued Expenses", type: "liability", tenant_id: tenantId, category: "current" },
    { code: "2300", name: "Short-term Loans", type: "liability", tenant_id: tenantId, category: "current" },
    { code: "2400", name: "Other Current Liabilities", type: "liability", tenant_id: tenantId, category: "current" },
    // LIABILITIES — non-current
    { code: "2500", name: "Long-term Loans", type: "liability", tenant_id: tenantId, category: "non_current" },
    { code: "2600", name: "Deferred Tax Liabilities", type: "liability", tenant_id: tenantId, category: "non_current" },
    { code: "2650", name: "Lease Liabilities", type: "liability", tenant_id: tenantId, category: "non_current" },

    // EQUITY
    { code: "3000", name: "Equity", type: "equity", tenant_id: tenantId },
    { code: "3100", name: "Retained Earnings", type: "equity", tenant_id: tenantId },
    { code: "3200", name: "Share Capital", type: "equity", tenant_id: tenantId },
    { code: "3300", name: "Owner's Drawings", type: "equity", tenant_id: tenantId },

    // REVENUE
    { code: "4000", name: "Sales Revenue", type: "revenue", tenant_id: tenantId, account_classification: "revenue" },
    { code: "4100", name: "Service Revenue", type: "revenue", tenant_id: tenantId, account_classification: "revenue" },
    { code: "4200", name: "Other Income", type: "revenue", tenant_id: tenantId, account_classification: "other_income" },

    // EXPENSES — UAE/GCC template
    { code: "5000", name: "Professional Fees", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
    { code: "5200", name: "Marketing & Advertising", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
    { code: "5300", name: "General Expense", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
    { code: "5350", name: "Delivery & Logistics", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
    { code: "5400", name: "Salaries & Wages", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
    { code: "5450", name: "Software Subscriptions", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
    { code: "5500", name: "Cost of Goods Sold", type: "expense", tenant_id: tenantId, account_classification: "cost_of_sales" },
    { code: "5520", name: "Direct Labor", type: "expense", tenant_id: tenantId, account_classification: "cost_of_sales" },
    { code: "5530", name: "Manufacturing Costs", type: "expense", tenant_id: tenantId, account_classification: "cost_of_sales" },
    { code: "5550", name: "Insurance Expense", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
    { code: "5600", name: "Depreciation Expense", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
    { code: "5650", name: "Office Expenses", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
    { code: "5700", name: "Rent Expense", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
    { code: "5800", name: "Utilities Expense", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
    { code: "5900", name: "Other Expenses", type: "expense", tenant_id: tenantId, account_classification: "operating_expense" },
  ];

  // Check which accounts already exist
  // Type assertion to fix Supabase type inference
  const table = supabase.from("chart_of_accounts") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        in: (column: string, values: string[]) => Promise<{ data: Pick<ChartOfAccountsRow, "code">[] | null; error: unknown }>;
      };
    };
  };
  const { data: existing } = await table
    .select("code")
    .eq("tenant_id", tenantId)
    .in("code", defaultAccounts.map((a) => a.code));

  const existingCodes = new Set(existing?.map((a) => a.code) ?? []);
  const accountsToCreate = defaultAccounts
    .filter((a) => !existingCodes.has(a.code))
    .map((a) => enrichSeedCoaRow(a, tenantId));

  if (accountsToCreate.length === 0) {
    return; // All accounts already exist
  }

  const insertTable = supabase.from("chart_of_accounts") as unknown as {
    insert: (values: Record<string, unknown>[]) => Promise<{ error: unknown }>;
  };
  const { error } = await insertTable.insert(accountsToCreate);

  if (error) {
    console.error("Failed to create default accounts", error);
    throw error;
  }

  console.log(`Created ${accountsToCreate.length} default accounts for tenant ${tenantId}`);
}

export type IntentAccountMapping =
  Database["public"]["Tables"]["intent_account_mappings"]["Row"];

export async function listIntentAccountMappings() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("intent_account_mappings")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("intent");

  if (error) {
    console.error("Failed to load intent mappings", error);
    throw error;
  }

  return data ?? [];
}

export async function getIntentAccountMapping(intent: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("intent_account_mappings")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("intent", intent)
    .maybeSingle();

  if (error) {
    console.error("Failed to load intent mapping", error);
    throw error;
  }

  return data ?? null;
}

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

type ChartOfAccountsRow = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

export async function listAccounts() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("code");

  if (error) {
    console.error("Failed to load accounts", error);
    throw error;
  }

  return data ?? [];
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
  
  const defaultAccounts = [
    // ASSETS
    // Current Assets (1000-1999)
    { code: "1000", name: "Cash", type: "asset" as const },
    { code: "1100", name: "Accounts Receivable", type: "asset" as const },
    { code: "1200", name: "Inventory", type: "asset" as const },
    { code: "1300", name: "Prepaid Expenses", type: "asset" as const },
    { code: "1400", name: "Other Current Assets", type: "asset" as const },
    // Non-Current Assets (1500-1999)
    { code: "1500", name: "Property, Plant & Equipment", type: "asset" as const },
    { code: "1600", name: "Accumulated Depreciation", type: "asset" as const },
    { code: "1700", name: "Intangible Assets", type: "asset" as const },
    { code: "1800", name: "Long-term Investments", type: "asset" as const },
    
    // LIABILITIES
    // Current Liabilities (2000-2499)
    { code: "2000", name: "Accounts Payable", type: "liability" as const },
    { code: "2100", name: "VAT Output Tax", type: "liability" as const },
    { code: "2200", name: "Accrued Expenses", type: "liability" as const },
    { code: "2300", name: "Short-term Debt", type: "liability" as const },
    { code: "2400", name: "Other Current Liabilities", type: "liability" as const },
    // Non-Current Liabilities (2500-2999)
    { code: "2500", name: "Long-term Debt", type: "liability" as const },
    { code: "2600", name: "Deferred Tax Liabilities", type: "liability" as const },
    
    // EQUITY (3000-3999)
    { code: "3000", name: "Equity", type: "equity" as const },
    { code: "3100", name: "Retained Earnings", type: "equity" as const },
    { code: "3200", name: "Share Capital", type: "equity" as const },
    
    // REVENUE (4000-4999)
    { code: "4000", name: "Sales Revenue", type: "revenue" as const },
    { code: "4100", name: "Service Revenue", type: "revenue" as const },
    { code: "4200", name: "Other Income", type: "revenue" as const },
    
    // EXPENSES (5000-5999)
    { code: "5000", name: "Consulting Expense", type: "expense" as const },
    { code: "5200", name: "Marketing Expense", type: "expense" as const },
    { code: "5300", name: "General Expense", type: "expense" as const },
    { code: "5400", name: "Salaries & Wages", type: "expense" as const },
    { code: "5500", name: "Cost of Goods Sold", type: "expense" as const },
    { code: "5600", name: "Depreciation Expense", type: "expense" as const },
    { code: "5700", name: "Rent Expense", type: "expense" as const },
    { code: "5800", name: "Utilities Expense", type: "expense" as const },
    { code: "5900", name: "Other Expenses", type: "expense" as const },
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
  const accountsToCreate = defaultAccounts.filter((a) => !existingCodes.has(a.code));

  if (accountsToCreate.length === 0) {
    return; // All accounts already exist
  }

  // Insert missing accounts
  // Type assertion to fix Supabase type inference
  type ChartOfAccountsInsert = Database["public"]["Tables"]["chart_of_accounts"]["Insert"];
  const insertTable = supabase.from("chart_of_accounts") as unknown as {
    insert: (values: ChartOfAccountsInsert[]) => Promise<{ error: unknown }>;
  };
  const { error } = await insertTable.insert(
    accountsToCreate.map((account) => ({
      tenant_id: tenantId,
      ...account,
    } as ChartOfAccountsInsert)),
  );

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

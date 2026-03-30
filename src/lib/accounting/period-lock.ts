import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type TenantPeriodRow = {
  accounting_period_closed_through: string | null;
};

/**
 * Throws if entryDate (YYYY-MM-DD) falls in a closed accounting period for the tenant.
 */
export async function assertPostingDateAllowed(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  entryDate: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("tenants")
    .select("accounting_period_closed_through")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) throw error;

  const closedThrough = (data as TenantPeriodRow | null)?.accounting_period_closed_through;
  if (!closedThrough) return;

  if (entryDate <= closedThrough) {
    throw new Error(
      `This period is closed through ${closedThrough}. Choose a transaction date after ${closedThrough}, or ask an admin to reopen books in Tenant Settings.`,
    );
  }
}

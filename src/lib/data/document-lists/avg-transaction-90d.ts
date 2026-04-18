import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Mean absolute journal entry amount (base currency) over the last 90 days, posted only.
 */
export async function getAveragePostedTransactionAmount90d(tenantId: string): Promise<number | null> {
  const supabase = await createServerSupabaseClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("journal_entries")
    .select("amount_in_base_currency")
    .eq("tenant_id", tenantId)
    .eq("status", "posted")
    .gte("date", cutoffStr);

  if (error) {
    console.error("getAveragePostedTransactionAmount90d", error);
    return null;
  }

  const rows = (data ?? []) as { amount_in_base_currency: number | null }[];
  const values = rows
    .map((r) => Math.abs(Number(r.amount_in_base_currency ?? 0)))
    .filter((n) => n > 0);

  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

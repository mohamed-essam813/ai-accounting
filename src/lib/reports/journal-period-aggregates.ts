import { createServerSupabaseClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/posting/posting-engine";

/**
 * Sums debits and credits per account for posted journal entries in [startDate, endDate] (inclusive).
 * Used for P&L period activity. Prefer DB aggregation RPC when available.
 */
export async function sumJournalActivityByAccount(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, { debit: number; credit: number }>> {
  const supabase = await createServerSupabaseClient();
  const m = new Map<string, { debit: number; credit: number }>();
  const { data, error } = await supabase.rpc("report_account_activity_sums", {
    p_tenant_id: tenantId,
    p_start: startDate,
    p_end: endDate,
  });
  if (!error && data) {
    for (const r of data) {
      m.set(r.account_id, {
        debit: round2(Number(r.sum_debit)),
        credit: round2(Number(r.sum_credit)),
      });
    }
    return m;
  }
  if (error) {
    console.warn("[sumJournalActivityByAccount] RPC failed, falling back to line query:", error.message);
  }
  return sumJournalActivityByAccountFallback(tenantId, startDate, endDate);
}

async function sumJournalActivityByAccountFallback(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, { debit: number; credit: number }>> {
  const supabase = await createServerSupabaseClient();
  const m = new Map<string, { debit: number; credit: number }>();
  const pageSize = 5_000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("journal_lines")
      .select("account_id, debit, credit, journal_entries!inner(date, status, tenant_id)")
      .eq("journal_entries.tenant_id", tenantId)
      .eq("journal_entries.status", "posted")
      .gte("journal_entries.date", startDate)
      .lte("journal_entries.date", endDate)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const line of data) {
      const acc = (line as { account_id: string }).account_id;
      if (!m.has(acc)) m.set(acc, { debit: 0, credit: 0 });
      const row = m.get(acc)!;
      row.debit = round2(row.debit + Number((line as { debit: string | number }).debit ?? 0));
      row.credit = round2(row.credit + Number((line as { credit: string | number }).credit ?? 0));
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return m;
}

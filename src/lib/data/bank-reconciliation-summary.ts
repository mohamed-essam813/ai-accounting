import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { getTenantBaseCurrency } from "@/lib/utils/currency-conversion";

function addDaysIso(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Posted GL balance for a bank (asset) account: sum(debit − credit) through `asOfDate` inclusive.
 */
export async function getBankAccountLedgerBalanceAsOf(
  tenantId: string,
  bankAccountId: string,
  asOfDate: string,
): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { data: lines, error: lErr } = await supabase
    .from("journal_lines")
    .select("debit, credit, entry_id")
    .eq("account_id", bankAccountId);
  if (lErr) throw lErr;
  if (!lines?.length) return 0;

  const entryIds = [...new Set(lines.map((l) => l.entry_id))];
  const { data: entries, error: eErr } = await supabase
    .from("journal_entries")
    .select("id, date, status")
    .eq("tenant_id", tenantId)
    .in("id", entryIds)
    .eq("status", "posted")
    .lte("date", asOfDate);
  if (eErr) throw eErr;
  const allowed = new Set((entries ?? []).map((e) => e.id));

  let sum = 0;
  for (const l of lines) {
    if (!allowed.has(l.entry_id)) continue;
    sum += Number(l.debit ?? 0) - Number(l.credit ?? 0);
  }
  return Math.round(sum * 100) / 100;
}

export type BankReconciliationSummaryData = {
  bankAccountId: string;
  currencyCode: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalImported: number;
  matchedCount: number;
  excludedCount: number;
  /** Matched + excluded (cleared from the review queue). */
  resolvedCount: number;
  unmatchedCount: number;
  importedNetAmount: number;
  unmatchedNetAmount: number;
  /** Book balance (GL) at end of statement period (last imported line date), inclusive. */
  bookBalanceAsOfPeriodEnd: number;
  /** Book balance the day before first imported line in range (for context). */
  bookBalanceBeforePeriod: number | null;
};

export async function getBankReconciliationSummary(
  bankAccountId: string,
): Promise<BankReconciliationSummaryData | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) return null;

  const tenantId = user.tenant.id;
  const baseCurrency = await getTenantBaseCurrency(tenantId);

  const supabase = await createServerSupabaseClient();
  const { data: txns, error } = await supabase
    .from("bank_transactions")
    .select("id, date, amount, status")
    .eq("tenant_id", tenantId)
    .eq("bank_account_id", bankAccountId)
    .order("date", { ascending: true })
    .limit(5000);

  if (error) throw error;
  const rows = txns ?? [];
  if (rows.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    const book = await getBankAccountLedgerBalanceAsOf(tenantId, bankAccountId, today);
    return {
      bankAccountId,
      currencyCode: baseCurrency,
      periodStart: null,
      periodEnd: null,
      totalImported: 0,
      matchedCount: 0,
      excludedCount: 0,
      resolvedCount: 0,
      unmatchedCount: 0,
      importedNetAmount: 0,
      unmatchedNetAmount: 0,
      bookBalanceAsOfPeriodEnd: book,
      bookBalanceBeforePeriod: null,
    };
  }

  const dates = rows.map((r) => String(r.date).slice(0, 10));
  const periodStart = dates.reduce((a, b) => (a < b ? a : b));
  const periodEnd = dates.reduce((a, b) => (a > b ? a : b));

  let matchedCount = 0;
  let excludedCount = 0;
  let unmatchedCount = 0;
  let importedNetAmount = 0;
  let unmatchedNetAmount = 0;

  for (const r of rows) {
    const amt = Number(r.amount);
    importedNetAmount += amt;
    const st = r.status;
    if (st === "matched") {
      matchedCount += 1;
    } else if (st === "excluded") {
      excludedCount += 1;
    } else {
      unmatchedCount += 1;
      unmatchedNetAmount += amt;
    }
  }

  const resolvedCount = matchedCount + excludedCount;

  const bookBalanceAsOfPeriodEnd = await getBankAccountLedgerBalanceAsOf(
    tenantId,
    bankAccountId,
    periodEnd,
  );
  const dayBefore = addDaysIso(periodStart, -1);
  const bookBalanceBeforePeriod = await getBankAccountLedgerBalanceAsOf(
    tenantId,
    bankAccountId,
    dayBefore,
  );

  return {
    bankAccountId,
    currencyCode: baseCurrency,
    periodStart,
    periodEnd,
    totalImported: rows.length,
    matchedCount,
    excludedCount,
    resolvedCount,
    unmatchedCount,
    importedNetAmount: Math.round(importedNetAmount * 100) / 100,
    unmatchedNetAmount: Math.round(unmatchedNetAmount * 100) / 100,
    bookBalanceAsOfPeriodEnd,
    bookBalanceBeforePeriod,
  };
}

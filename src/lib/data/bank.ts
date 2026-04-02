import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  formatExistingMatchLabel,
  scorePaymentAgainstBankTxn,
  type BankTxnForMatch,
  type PaymentRowForMatch,
} from "@/lib/bank/existing-payment-match";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

type BankTransactionsRow = Database["public"]["Tables"]["bank_transactions"]["Row"];

export type ExistingPaymentMatchResult = {
  paymentId: string;
  journalEntryId: string;
  voucherNumber: string | null;
  paymentType: "receipt" | "payment";
  paymentDate: string;
  amount: number;
  label: string;
  tier: 1 | 2 | 3;
};

function addDaysIso(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

async function findExistingPaymentMatchesForTransactions(
  tenantId: string,
  txns: Array<{
    id: string;
    date: string;
    amount: number;
    description: string;
    bank_account_id?: string | null;
    counterparty?: string | null;
    status: string;
  }>,
): Promise<Map<string, ExistingPaymentMatchResult | null>> {
  const result = new Map<string, ExistingPaymentMatchResult | null>();
  const unmatched = txns.filter((t) => t.status === "unmatched" && t.bank_account_id);
  if (unmatched.length === 0) {
    txns.forEach((t) => result.set(t.id, null));
    return result;
  }

  const supabase = await createServerSupabaseClient();

  const { data: usedRows } = await supabase
    .from("bank_transactions")
    .select("matched_entry_id")
    .eq("tenant_id", tenantId)
    .eq("status", "matched")
    .not("matched_entry_id", "is", null);

  const usedJournalEntryIds = new Set(
    (usedRows ?? [])
      .map((r) => r.matched_entry_id)
      .filter((id): id is string => Boolean(id)),
  );

  let minD = unmatched[0].date;
  let maxD = unmatched[0].date;
  for (const t of unmatched) {
    if (t.date < minD) minD = t.date;
    if (t.date > maxD) maxD = t.date;
  }
  const minDate = addDaysIso(minD.slice(0, 10), -7);
  const maxDate = addDaysIso(maxD.slice(0, 10), 7);

  const bankIds = [...new Set(unmatched.map((t) => t.bank_account_id).filter(Boolean))] as string[];

  const { data: payments, error: pErr } = await supabase
    .from("payments")
    .select(
      "id, journal_entry_id, bank_account_id, amount, payment_date, payment_type, contact_id, reference, voucher_number",
    )
    .eq("tenant_id", tenantId)
    .in("bank_account_id", bankIds)
    .gte("payment_date", minDate)
    .lte("payment_date", maxDate);

  if (pErr) throw pErr;

  const payList = (payments ?? []) as PaymentRowForMatch[];
  const contactIds = [...new Set(payList.map((p) => p.contact_id).filter(Boolean))] as string[];
  let nameByContact = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase.from("contacts").select("id, name").in("id", contactIds);
    nameByContact = new Map((contacts ?? []).map((c) => [c.id, c.name]));
  }

  for (const t of txns) {
    if (t.status !== "unmatched" || !t.bank_account_id) {
      result.set(t.id, null);
      continue;
    }

    const txnForScore: BankTxnForMatch = {
      id: t.id,
      date: t.date,
      amount: t.amount,
      bank_account_id: t.bank_account_id,
      counterparty: t.counterparty ?? null,
      description: t.description,
    };

    let best: { payment: PaymentRowForMatch; score: number; tier: 1 | 2 | 3 } | null = null;

    for (const payment of payList) {
      if (usedJournalEntryIds.has(payment.journal_entry_id)) continue;

      const contactName = payment.contact_id ? nameByContact.get(payment.contact_id) ?? null : null;
      const scored = scorePaymentAgainstBankTxn(txnForScore, payment, contactName);
      if (!scored) continue;
      if (!best || scored.score < best.score) {
        best = { payment, score: scored.score, tier: scored.tier };
      }
    }

    if (!best) {
      result.set(t.id, null);
      continue;
    }

    const pt = best.payment.payment_type === "receipt" ? "receipt" : "payment";
    result.set(t.id, {
      paymentId: best.payment.id,
      journalEntryId: best.payment.journal_entry_id,
      voucherNumber: best.payment.voucher_number,
      paymentType: pt,
      paymentDate: best.payment.payment_date,
      amount: Number(best.payment.amount),
      label: formatExistingMatchLabel(best.payment, pt),
      tier: best.tier,
    });
  }

  return result;
}

export async function listBankTransactions(limit = 50, bankAccountId?: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  // Type assertion to fix Supabase type inference
  const table = supabase.from("bank_transactions") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq?: (column: string, value: string) => {
          order: (column: string, options?: { ascending?: boolean }) => {
            limit: (count: number) => Promise<{ data: BankTransactionsRow[] | null; error: unknown }>;
          };
        };
        order: (column: string, options?: { ascending?: boolean }) => {
          limit: (count: number) => Promise<{ data: BankTransactionsRow[] | null; error: unknown }>;
        };
      };
    };
  };
  let query = table.select("*").eq("tenant_id", user.tenant.id);
  if (bankAccountId) {
    query = query.eq?.("bank_account_id", bankAccountId) ?? query;
  }
  const { data, error } = await query
    .order("date", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((txn) => ({
    ...txn,
    amount: Number(txn.amount),
    status: txn.status as "unmatched" | "matched" | "excluded",
  }));
}

/** Same as {@link listBankTransactions}, plus {@link ExistingPaymentMatchResult} for unmatched lines (Record Activity payments/receipts). */
export async function listBankTransactionsWithExistingMatches(limit = 50, bankAccountId?: string) {
  const txns = await listBankTransactions(limit, bankAccountId);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return txns.map((t) => ({ ...t, existingMatch: null as ExistingPaymentMatchResult | null }));
  }
  const map = await findExistingPaymentMatchesForTransactions(user.tenant.id, txns);
  return txns.map((t) => ({ ...t, existingMatch: map.get(t.id) ?? null }));
}

export async function suggestReconciliations(amount: number, description: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();

  // Type assertion to fix Supabase type inference
  type JournalEntryWithLines = {
    id: string;
    description: string;
    posted_at: string;
    journal_lines: Array<{ debit: string | null; credit: string | null }> | null;
  };
  const table = supabase.from("journal_entries") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options?: { ascending?: boolean }) => {
            limit: (count: number) => Promise<{ data: JournalEntryWithLines[] | null; error: unknown }>;
          };
        };
      };
    };
  };
  const { data, error } = await table
    .select("id, description, posted_at, journal_lines ( debit, credit )")
    .eq("tenant_id", user.tenant.id)
    .eq("status", "posted")
    .order("posted_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  const normalizedDescription = description.toLowerCase();
  const matches =
    data?.filter((entry) => {
      const lines = entry.journal_lines ?? [];
      const amounts = lines.map((line) =>
        line.debit && Number(line.debit) > 0 ? Number(line.debit) : Number(line.credit),
      );
      const amountMatch = amounts.some(
        (lineAmount) => Math.abs(lineAmount - Math.abs(amount)) < 1,
      );
      const descriptionMatch = entry.description.toLowerCase().includes(
        normalizedDescription.split(" ")[0] ?? "",
      );
      return amountMatch || descriptionMatch;
    }) ?? [];

  return matches.slice(0, 5);
}


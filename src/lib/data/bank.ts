import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

type BankTransactionsRow = Database["public"]["Tables"]["bank_transactions"]["Row"];

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


import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";

export async function listBankTransactions(limit = 50) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("date", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((txn) => ({
    ...txn,
    amount: Number(txn.amount),
  }));
}

export async function suggestReconciliations(amount: number, description: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("journal_entries")
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


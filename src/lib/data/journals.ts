import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

type JournalEntriesRow = Database["public"]["Tables"]["journal_entries"]["Row"];
type JournalLinesRow = Database["public"]["Tables"]["journal_lines"]["Row"];

export type JournalEntryWithLines = JournalEntriesRow & {
  journal_lines: (JournalLinesRow & {
    account_code: string;
    account_name: string;
  })[];
};

export type ListJournalEntriesFilters = {
  startDate?: string;
  endDate?: string;
  accountCode?: string;
  search?: string;
  status?: "draft" | "posted" | "all";
  limit?: number;
};

/**
 * List journal entries with optional filters (Doc 9: Journal filters).
 */
export async function listJournalEntries(
  opts: ListJournalEntriesFilters | number = 50,
): Promise<JournalEntryWithLines[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const filters: ListJournalEntriesFilters =
    typeof opts === "number" ? { limit: opts } : opts;
  const limit = filters.limit ?? 50;

  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("journal_entries")
    .select("*")
    .eq("tenant_id", user.tenant.id);

  if (filters.startDate) {
    query = query.gte("date", filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte("date", filters.endDate);
  }
  if (filters.search?.trim()) {
    query = query.ilike("description", `%${filters.search.trim()}%`);
  }
  const statusFilter = filters.status ?? "all";
  if (statusFilter === "draft") {
    query = query.eq("status", "draft");
  } else if (statusFilter === "posted") {
    query = query.eq("status", "posted");
  }

  const { data: entries, error: entriesError } = await query
    .order("date", { ascending: false })
    .limit(limit);

  if (entriesError) {
    console.error("Failed to load journal entries", entriesError);
    throw entriesError;
  }

  if (!entries || entries.length === 0) {
    return [];
  }

  const entryIds = entries.map((e) => e.id);
  const { data: lines, error: linesError } = await supabase
    .from("journal_lines")
    .select("*")
    .in("entry_id", entryIds);

  if (linesError) {
    console.error("Failed to load journal lines", linesError);
    throw linesError;
  }

  const accountIds = new Set((lines ?? []).map((l) => l.account_id));
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name")
    .in("id", Array.from(accountIds));

  const accountMap = new Map(accounts?.map((a) => [a.id, a]) ?? []);

  let combined = entries.map((entry) => ({
    ...entry,
    journal_lines: (lines ?? [])
      .filter((line) => line.entry_id === entry.id)
      .map((line) => {
        const account = accountMap.get(line.account_id);
        return {
          ...line,
          account_code: account?.code ?? "",
          account_name: account?.name ?? "",
        };
      }),
  })) as JournalEntryWithLines[];

  if (filters.accountCode?.trim()) {
    const code = filters.accountCode.trim().toUpperCase();
    combined = combined.filter((entry) =>
      entry.journal_lines.some(
        (l) => l.account_code?.toUpperCase() === code,
      ),
    );
  }

  return combined;
}

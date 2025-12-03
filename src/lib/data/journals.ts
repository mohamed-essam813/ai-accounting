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

export async function listJournalEntries(limit = 50) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  
  // Get journal entries
  const entriesTable = supabase.from("journal_entries") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: { ascending?: boolean }) => {
          limit: (count: number) => Promise<{ data: JournalEntriesRow[] | null; error: unknown }>;
        };
      };
    };
  };
  const { data: entries, error: entriesError } = await entriesTable
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("date", { ascending: false })
    .limit(limit);

  if (entriesError) {
    console.error("Failed to load journal entries", entriesError);
    throw entriesError;
  }

  if (!entries || entries.length === 0) {
    return [];
  }

  // Get journal lines for these entries
  const entryIds = entries.map((e) => e.id);
  const linesTable = supabase.from("journal_lines") as unknown as {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{ data: JournalLinesRow[] | null; error: unknown }>;
    };
  };
  const { data: lines, error: linesError } = await linesTable
    .select("*")
    .in("entry_id", entryIds);

  if (linesError) {
    console.error("Failed to load journal lines", linesError);
    throw linesError;
  }

  // Get accounts for the lines
  const accountIds = new Set((lines ?? []).map((l) => l.account_id));
  const accountsTable = supabase.from("chart_of_accounts") as unknown as {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{ 
        data: Array<{ id: string; code: string; name: string }> | null; 
        error: unknown 
      }>;
    };
  };
  const { data: accounts } = await accountsTable
    .select("id, code, name")
    .in("id", Array.from(accountIds));

  const accountMap = new Map(accounts?.map((a) => [a.id, a]) ?? []);

  // Combine entries with lines
  return entries.map((entry) => ({
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
}


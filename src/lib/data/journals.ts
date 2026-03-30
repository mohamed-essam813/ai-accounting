import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "../database.types";

type JournalEntriesRow = Database["public"]["Tables"]["journal_entries"]["Row"];
type JournalLinesRow = Database["public"]["Tables"]["journal_lines"]["Row"];

export type JournalEntryWithLines = JournalEntriesRow & {
  journal_lines: JournalLinesRow[];
};

export type ListJournalEntriesFilters = {
  startDate?: string;
  endDate?: string;
  accountCode?: string;
  search?: string;
  status?: "draft" | "approved" | "posted" | "all";
  limit?: number;
};

/**
 * List journal entries with optional filters.
 */
export async function listJournalEntries(
  filters: ListJournalEntriesFilters = {},
): Promise<JournalEntryWithLines[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("journal_entries")
    .select(
      `
      *,
      journal_lines (*)
    `,
    )
    .eq("tenant_id", user.tenant.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.startDate) {
    query = query.gte("date", filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte("date", filters.endDate);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) throw error;

  let entries = (data ?? []) as JournalEntryWithLines[];

  // Filter by account code (client-side since we need to check journal_lines)
  if (filters.accountCode) {
    entries = entries.filter((entry) =>
      entry.journal_lines.some((line) => {
        // We need to fetch account code from chart_of_accounts
        // For now, we'll do a simple check - this could be optimized with a join
        return true; // Placeholder - will be filtered properly in the component
      }),
    );
  }

  // Filter by search term (description)
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    entries = entries.filter(
      (entry) =>
        entry.description.toLowerCase().includes(searchLower) ||
        entry.journal_lines.some((line) =>
          (line.memo || "").toLowerCase().includes(searchLower),
        ),
    );
  }

  return entries;
}

/**
 * Get a single journal entry by ID
 */
export async function getJournalEntry(entryId: string): Promise<JournalEntryWithLines | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("journal_entries")
    .select(
      `
      *,
      journal_lines (*)
    `,
    )
    .eq("id", entryId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) throw error;
  return data as JournalEntryWithLines | null;
}

/**
 * Journal Templates
 * Get journal templates for the current tenant
 */
export type JournalTemplateLine = {
  line_key: string;
  side: "debit" | "credit";
  default_account_id: string | null;
  default_account_code: string | null;
  default_memo: string | null;
  lock_account: boolean;
};

export type JournalTemplate = {
  id: string;
  tenant_id: string;
  name: string;
  description_default: string | null;
  lines: JournalTemplateLine[];
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export async function getJournalTemplates(): Promise<JournalTemplate[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase.from("journal_templates" as any) as any)
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to fetch journal templates:", error);
    return [];
  }

  return (data ?? []).map((t: any) => ({
    id: t.id,
    tenant_id: t.tenant_id,
    name: t.name,
    description_default: t.description_default,
    lines: t.lines as JournalTemplateLine[],
    is_system: t.is_system,
    created_at: t.created_at,
    updated_at: t.updated_at,
  })) as JournalTemplate[];
}

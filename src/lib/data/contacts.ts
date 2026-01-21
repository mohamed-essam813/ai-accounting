import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

type ContactsRow = Database["public"]["Tables"]["contacts"]["Row"];

export async function listContacts() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true)
    .order("code");

  if (error) {
    console.error("Failed to load contacts", error);
    throw error;
  }

  return data ?? [];
}

export async function getContactById(contactId: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load contact", error);
    throw error;
  }

  return data;
}

export async function getContactByCode(code: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("code", code)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load contact", error);
    throw error;
  }

  return data;
}

export type StatementTransaction = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  document_number?: string | null;
  entry_id?: string;
};

export async function getContactStatement(
  contactId: string,
  startDate?: string,
  endDate?: string,
): Promise<StatementTransaction[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const contact = await getContactById(contactId);
  if (!contact) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  
  // First, try to get entries via contact_id (preferred method)
  // Get journal entries linked to this contact
  type JournalEntriesRow = Database["public"]["Tables"]["journal_entries"]["Row"];
  let entriesQuery = supabase
    .from("journal_entries")
    .select<"id, date, description", Pick<JournalEntriesRow, "id" | "date" | "description">>("id, date, description")
    .eq("tenant_id", user.tenant.id)
    .eq("status", "posted")
    .eq("contact_id", contactId);
  
  // Apply date filters if provided
  if (startDate) {
    entriesQuery = entriesQuery.gte("date", startDate);
  }
  if (endDate) {
    entriesQuery = entriesQuery.lte("date", endDate);
  }
  
  const { data: entriesByContact } = await entriesQuery.order("date", { ascending: true });

  // Also get drafts linked to this contact
  const { data: draftsByContact } = await supabase
    .from("drafts")
    .select("id, data_json, posted_entry_id, contact_id")
    .eq("tenant_id", user.tenant.id)
    .eq("status", "posted")
    .not("posted_entry_id", "is", null);

  const entryIds = new Set<string>();
  const draftMap = new Map<string, { invoice_number?: string | null; counterparty?: string | null }>();

  // Add entries found by contact_id
  if (entriesByContact) {
    entriesByContact.forEach((entry) => {
      entryIds.add(entry.id);
    });
  }

  // Process drafts: prefer contact_id, fallback to name matching for backward compatibility
  (draftsByContact ?? []).forEach((draft) => {
    const data = draft.data_json as { counterparty?: string | null; invoice_number?: string | null };
    const matchesByContactId = draft.contact_id === contactId;
    const matchesByName = data.counterparty && data.counterparty.toLowerCase() === contact.name.toLowerCase();
    
    if (matchesByContactId || matchesByName) {
      if (draft.posted_entry_id) {
        entryIds.add(draft.posted_entry_id);
        draftMap.set(draft.posted_entry_id, {
          invoice_number: data.invoice_number,
          counterparty: data.counterparty,
        });
      }
    }
  });

  // If no entries found via contact_id or drafts, try legacy name matching as fallback
  if (entryIds.size === 0) {
    const { data: allDrafts } = await supabase
      .from("drafts")
      .select("id, data_json, posted_entry_id")
      .eq("tenant_id", user.tenant.id)
      .eq("status", "posted")
      .not("posted_entry_id", "is", null);

    (allDrafts ?? []).forEach((draft) => {
      const data = draft.data_json as { counterparty?: string | null; invoice_number?: string | null };
      if (data.counterparty && data.counterparty.toLowerCase() === contact.name.toLowerCase()) {
        if (draft.posted_entry_id) {
          entryIds.add(draft.posted_entry_id);
          draftMap.set(draft.posted_entry_id, {
            invoice_number: data.invoice_number,
            counterparty: data.counterparty,
          });
        }
      }
    });
  }

  if (entryIds.size === 0) {
    return [];
  }

  // Get journal entries and lines
  type JournalLinesRow = Database["public"]["Tables"]["journal_lines"]["Row"];
  
  // Use entriesByContact if we found entries by contact_id, otherwise fetch by entryIds
  // Type entries as array of objects with only id, date, description (we only need these fields)
  type EntryBasic = { id: string; date: string; description: string };
  let entries: EntryBasic[] = [];
  if (entriesByContact && entriesByContact.length > 0) {
    // Filter to only entries that are in our entryIds set
    entries = entriesByContact.filter((e) => entryIds.has(e.id)) as EntryBasic[];
  } else {
    let fetchedQuery = supabase
      .from("journal_entries")
      .select<"id, date, description", Pick<JournalEntriesRow, "id" | "date" | "description">>("id, date, description")
      .in("id", Array.from(entryIds))
      .eq("status", "posted");
    
    // Apply date filters if provided
    if (startDate) {
      fetchedQuery = fetchedQuery.gte("date", startDate);
    }
    if (endDate) {
      fetchedQuery = fetchedQuery.lte("date", endDate);
    }
    
    const { data: fetchedEntries } = await fetchedQuery.order("date", { ascending: true });
    entries = (fetchedEntries ?? []) as EntryBasic[];
  }

  if (!entries || entries.length === 0) {
    return [];
  }

  // Get journal lines for Accounts Receivable (1100) or Accounts Payable (2000)
  // depending on contact type
  const accountCode = contact.type === "customer" ? "1100" : "2000";
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", user.tenant.id)
    .eq("code", accountCode)
    .maybeSingle();

  if (!accounts) {
    return [];
  }

  const { data: lines } = await supabase
    .from("journal_lines")
    .select("entry_id, debit, credit, memo")
    .in("entry_id", entries.map((e) => e.id))
    .eq("account_id", accounts.id)
    .order("entry_id");

  // Build statement transactions
  const transactions: StatementTransaction[] = [];
  let runningBalance = 0;

  entries.forEach((entry) => {
    const entryLines = lines?.filter((l) => l.entry_id === entry.id) ?? [];
    const totalDebit = entryLines.reduce((sum, l) => sum + Number(l.debit ?? 0), 0);
    const totalCredit = entryLines.reduce((sum, l) => sum + Number(l.credit ?? 0), 0);
    
    const draftInfo = draftMap.get(entry.id);
    
    if (contact.type === "customer") {
      // For customers: debit increases balance (they owe us), credit decreases (they paid)
      runningBalance += totalDebit - totalCredit;
      transactions.push({
        date: entry.date,
        description: entry.description,
        debit: totalDebit,
        credit: totalCredit,
        balance: runningBalance,
        document_number: draftInfo?.invoice_number ?? null,
        entry_id: entry.id,
      });
    } else {
      // For vendors: credit increases balance (we owe them), debit decreases (we paid)
      runningBalance += totalCredit - totalDebit;
      transactions.push({
        date: entry.date,
        description: entry.description,
        debit: totalDebit,
        credit: totalCredit,
        balance: runningBalance,
        document_number: draftInfo?.invoice_number ?? null,
        entry_id: entry.id,
      });
    }
  });

  return transactions;
}

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

/**
 * Generate the next sequential invoice number for a tenant
 * Format: INV-YYYY-NNNN (e.g., INV-2024-0001)
 */
export async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const currentYear = new Date().getFullYear();
  
  // Find the highest invoice number for this tenant in the current year
  // Query drafts with invoice intent that have invoice_number set
  type DraftsRow = Database["public"]["Tables"]["drafts"]["Row"];
  const draftsTable = supabase.from("drafts") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ data: Pick<DraftsRow, "data_json">[] | null; error: unknown }>;
      };
    };
  };
  const { data: drafts } = await draftsTable
    .select("data_json")
    .eq("tenant_id", tenantId)
    .eq("intent", "create_invoice");
  
  // Also check posted journal entries for invoice numbers in memo/description
  type JournalEntriesRow = Database["public"]["Tables"]["journal_entries"]["Row"];
  const entriesTable = supabase.from("journal_entries") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        like: (column: string, pattern: string) => Promise<{ data: Pick<JournalEntriesRow, "description">[] | null; error: unknown }>;
      };
    };
  };
  const { data: entries } = await entriesTable
    .select("description")
    .eq("tenant_id", tenantId)
    .like("description", "%Invoice #:%");
  
  // Extract invoice numbers from drafts
  const draftInvoiceNumbers: number[] = [];
  if (drafts) {
    for (const draft of drafts) {
      const data = draft.data_json as { invoice_number?: string | null };
      if (data?.invoice_number) {
        const match = data.invoice_number.match(/INV-(\d{4})-(\d+)/);
        if (match && parseInt(match[1]) === currentYear) {
          draftInvoiceNumbers.push(parseInt(match[2]));
        }
      }
    }
  }
  
  // Extract invoice numbers from journal entries
  if (entries) {
    for (const entry of entries) {
      const match = entry.description.match(/Invoice #:\s*INV-(\d{4})-(\d+)/);
      if (match && parseInt(match[1]) === currentYear) {
        draftInvoiceNumbers.push(parseInt(match[2]));
      }
    }
  }
  
  // Get the next sequential number
  const maxNumber = draftInvoiceNumbers.length > 0 ? Math.max(...draftInvoiceNumbers) : 0;
  const nextNumber = maxNumber + 1;
  
  // Format as INV-YYYY-NNNN
  return `INV-${currentYear}-${String(nextNumber).padStart(4, "0")}`;
}

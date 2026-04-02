import { createServerSupabaseClient } from "@/lib/supabase/server";
import { nextDocumentNumber } from "@/lib/utils/document-numbers";

/**
 * Generate the next sequential invoice number for a tenant
 * Format: INV-YYYY-NNNN (e.g., INV-2024-0001)
 */
export async function generateInvoiceNumber(tenantId: string): Promise<string> {
  // Backwards compatible shim: now uses atomic DB sequence.
  const today = new Date().toISOString().slice(0, 10);
  return nextDocumentNumber({ tenantId, documentType: "invoice", date: today });
}

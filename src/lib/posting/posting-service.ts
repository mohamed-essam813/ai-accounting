/**
 * Posting service facade.
 *
 * In this codebase, journal entries for sales invoices, supplier bills, and payments
 * are produced when an **approved draft** is posted (`postDraftAction`). Subledger
 * rows (`invoices`, `bills`, `payments`) are materialized after the journal entry
 * exists (`materializeInvoiceOrBillFromPostedDraft`, etc.).
 *
 * Standalone `post_invoice(invoice_id)` is not implemented: `invoices.journal_entry_id`
 * is NOT NULL, so an invoice row is always created after its journal entry.
 *
 * Use `postFromApprovedDraft` as the single backend entry point for posting
 * document-driven transactions that originated as drafts.
 */

import { postDraftAction } from "@/lib/actions/drafts";

export async function postFromApprovedDraft(draftId: string) {
  return postDraftAction({ draftId });
}

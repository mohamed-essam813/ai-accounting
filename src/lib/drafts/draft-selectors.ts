/**
 * Selectors: derive bill/edit UI fields from draft payload + journal preview (single source of truth).
 * Prefer these over ad hoc form defaults.
 */
import type { PreviewJournalLine } from "@/lib/drafts/draft-edit-defaults";
import { pickBillDebitAccountIdFromPreview } from "@/lib/drafts/draft-edit-defaults";
import type { Database } from "@/lib/database.types";
import { resolvePurchaseTypeForBillEditForm } from "@/lib/drafts/bill-purchase-classification";

type Account = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

export function getBillLineType(
  data: Record<string, unknown>,
  accounts: Account[],
): "expense" | "inventory" | "asset" {
  return resolvePurchaseTypeForBillEditForm(data, accounts);
}

export function getExpenseAccountIdFromPreview(
  purchaseType: "expense" | "inventory" | "asset",
  journalLines: PreviewJournalLine[],
  accounts: Account[],
): string | null {
  return pickBillDebitAccountIdFromPreview(purchaseType, journalLines, accounts);
}

export function getAssetNameFromDraft(data: Record<string, unknown>): string {
  const fa = data.fixed_asset_draft as { name?: string } | undefined;
  const desc = typeof data.description === "string" ? data.description.trim() : "";
  return fa?.name?.trim() || desc || "";
}

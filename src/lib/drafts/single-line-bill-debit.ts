import type { DraftPayload } from "@/lib/ai/schema";
import { getBusinessItemById } from "@/lib/data/inventory";
import {
  getAiSuggestedDebitFromDraftData,
  parseBillPurchaseType,
  type BillPurchaseClassification,
} from "@/lib/drafts/bill-purchase-classification";

export type { BillPurchaseClassification } from "@/lib/drafts/bill-purchase-classification";

/**
 * Single-line supplier bills: authoritative debit for journal lines from user classification
 * (bill_purchase_type / fixed_asset_draft / item), not from AI alone.
 * Server-only — do not import from Client Components.
 */
export async function resolveSingleLineBillDebitForJournal(
  draftDataRaw: Record<string, unknown>,
  aiAccounts: DraftPayload["accounts"] | undefined | null,
): Promise<{
  purchaseType: BillPurchaseClassification;
  debitAccountId: string;
  aiSuggestedDebitId: string | null;
}> {
  const purchaseType = parseBillPurchaseType(draftDataRaw);
  const aiSuggestedDebitId =
    aiAccounts?.debit_account?.existing_account_id ?? getAiSuggestedDebitFromDraftData(draftDataRaw);

  if (purchaseType === "asset") {
    const fa = draftDataRaw.fixed_asset_draft as { asset_account_id?: string } | undefined;
    if (!fa?.asset_account_id) {
      throw new Error(
        "Asset classification requires a fixed asset account. Complete asset details in the draft before previewing or posting.",
      );
    }
    return {
      purchaseType,
      debitAccountId: fa.asset_account_id,
      aiSuggestedDebitId,
    };
  }

  if (purchaseType === "inventory") {
    const itemId =
      (draftDataRaw.selected_item_id as string | undefined) ??
      (draftDataRaw.inventory_line_items as Array<{ item_id?: string }> | undefined)?.[0]?.item_id;
    if (!itemId) {
      throw new Error(
        "Inventory classification requires a selected inventory-tracked product.",
      );
    }
    const item = await getBusinessItemById(itemId);
    const inv = item?.inventory_account_id ?? null;
    if (!inv) {
      throw new Error("Selected item is missing an inventory account mapping.");
    }
    return { purchaseType, debitAccountId: inv, aiSuggestedDebitId };
  }

  const debitAccountId = aiSuggestedDebitId;
  if (!debitAccountId) {
    throw new Error(
      "Choose an expense category for this supplier bill (no AI debit account was resolved). Open the draft and pick an expense account.",
    );
  }
  return { purchaseType, debitAccountId, aiSuggestedDebitId };
}

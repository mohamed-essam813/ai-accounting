import type { Account } from "@/lib/accounting";
import type { DraftPayload } from "@/lib/ai/schema";
import { listAccounts } from "@/lib/data/accounts";
import { getBusinessItemById } from "@/lib/data/inventory";

export type BillPurchaseClassification = "expense" | "inventory" | "asset";

/** Debit suggested by AI / stored on draft (may disagree with user classification). */
export function getAiSuggestedDebitFromDraftData(data: Record<string, unknown>): string | null {
  const ai = data.ai_selected_accounts as
    | { debit_account?: { existing_account_id?: string } }
    | undefined;
  return ai?.debit_account?.existing_account_id ?? null;
}

export function parseBillPurchaseType(data: Record<string, unknown>): BillPurchaseClassification {
  const raw = data.bill_purchase_type as string | undefined;
  if (raw === "asset" || raw === "inventory" || raw === "expense") {
    return raw;
  }
  const ct = (data.classification_type as string | undefined)?.toUpperCase();
  if (ct === "ASSET" || ct === "INVENTORY" || ct === "EXPENSE") {
    return ct.toLowerCase() as BillPurchaseClassification;
  }
  return "expense";
}

export function assertDebitMatchesBillClassification(
  purchaseType: BillPurchaseClassification,
  debitAccount: Account,
): void {
  if (purchaseType === "expense") {
    if (debitAccount.type !== "expense") {
      throw new Error(
        `Selected account does not match expense classification. Account ${debitAccount.code} (${debitAccount.name}) has type "${debitAccount.type}"; expected expense.`,
      );
    }
    return;
  }
  // Asset purchases (fixed asset or inventory stock) debit an asset account.
  if (debitAccount.type !== "asset") {
    throw new Error(
      `Selected account does not match ${purchaseType} classification. Account ${debitAccount.code} (${debitAccount.name}) has type "${debitAccount.type}"; expected asset.`,
    );
  }
}

/**
 * Single-line supplier bills: authoritative debit for journal lines from user classification
 * (bill_purchase_type / fixed_asset_draft / item), not from AI alone.
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

  const coa = await listAccounts();
  const fallback5000 = coa.find((a) => a.code === "5000")?.id ?? null;
  const debitAccountId = aiSuggestedDebitId ?? fallback5000;
  if (!debitAccountId) {
    throw new Error("Choose an expense category for this supplier bill.");
  }
  return { purchaseType, debitAccountId, aiSuggestedDebitId };
}

export function logBillClassificationResolution(params: {
  draftId?: string;
  purchaseType: BillPurchaseClassification;
  aiSuggestedDebitId: string | null;
  finalDebitAccountId: string;
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.log("[draft-bill-classification]", {
    draft_id: params.draftId,
    user_classification: params.purchaseType,
    ai_suggested_debit_account_id: params.aiSuggestedDebitId,
    final_debit_account_id: params.finalDebitAccountId,
    overridden:
      params.aiSuggestedDebitId != null && params.aiSuggestedDebitId !== params.finalDebitAccountId,
  });
}

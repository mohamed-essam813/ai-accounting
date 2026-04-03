import type { Account } from "@/lib/accounting";

/**
 * Client-safe helpers for bill purchase type (no server-only imports).
 * Async resolution lives in `single-line-bill-debit.ts` (server/actions only).
 */

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
  if (debitAccount.type !== "asset") {
    throw new Error(
      `Selected account does not match ${purchaseType} classification. Account ${debitAccount.code} (${debitAccount.name}) has type "${debitAccount.type}"; expected asset.`,
    );
  }
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

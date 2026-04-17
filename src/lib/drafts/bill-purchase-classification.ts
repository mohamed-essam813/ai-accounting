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

/**
 * Returns the stored purchase type only when explicitly persisted (not a fallback).
 * Used so the Edit Draft form can infer from AI debit / lines when this is absent.
 */
export function getExplicitBillPurchaseType(data: Record<string, unknown>): BillPurchaseClassification | undefined {
  const raw = data.bill_purchase_type as string | undefined;
  if (raw === "asset" || raw === "inventory" || raw === "expense") {
    return raw;
  }
  const ct = (data.classification_type as string | undefined)?.toUpperCase();
  if (ct === "ASSET" || ct === "INVENTORY" || ct === "EXPENSE") {
    return ct.toLowerCase() as BillPurchaseClassification;
  }
  return undefined;
}

export type ChartAccountLite = {
  id: string;
  code?: string | null;
  name?: string | null;
  type?: string | null;
  detail_type?: string | null;
};

/**
 * Infer purchase type from AI debit account, item selection, fixed-asset draft, or multi-line document lines.
 * Does not read bill_purchase_type (callers combine with getExplicitBillPurchaseType as needed).
 */
export function inferBillPurchaseTypeFromHeuristics(
  data: Record<string, unknown>,
  accounts: ChartAccountLite[],
): BillPurchaseClassification {
  const docLines = data.document_line_items as Array<{ classification?: string }> | undefined;
  if (Array.isArray(docLines) && docLines.length > 0) {
    const classes = docLines.map((l) => l.classification).filter(Boolean);
    if (classes.includes("asset")) return "asset";
    if (classes.includes("inventory")) return "inventory";
    if (classes.includes("expense")) return "expense";
  }

  const fa = data.fixed_asset_draft as { asset_account_id?: string } | undefined;
  if (fa?.asset_account_id && String(fa.asset_account_id).length > 0) {
    return "asset";
  }

  const itemId =
    (data.selected_item_id as string | undefined) ||
    (data.inventory_line_items as Array<{ item_id?: string }> | undefined)?.[0]?.item_id;
  if (itemId && String(itemId).length > 0) {
    return "inventory";
  }
  if (data.guided_event_requires_item === true) {
    return "inventory";
  }

  const debitId = getAiSuggestedDebitFromDraftData(data);
  if (!debitId) return "expense";

  const acc = accounts.find((a) => a.id === debitId);
  if (!acc) return "expense";

  if (acc.type === "expense") return "expense";

  if (acc.type === "asset") {
    if (acc.detail_type === "fixed_asset") return "asset";
    const code = (acc.code ?? "").trim();
    if (code === "1200" || /\binventory\b/i.test(acc.name ?? "")) return "inventory";
    if (acc.detail_type === "other_current_asset") return "inventory";
  }

  return "expense";
}

/**
 * Single source of truth for the Edit Draft modal: explicit DB fields, else heuristics (matches journal preview signals).
 */
export function resolvePurchaseTypeForBillEditForm(
  data: Record<string, unknown>,
  accounts: ChartAccountLite[],
): BillPurchaseClassification {
  const explicit = getExplicitBillPurchaseType(data);
  const inferred = inferBillPurchaseTypeFromHeuristics(data, accounts);
  if (explicit === undefined) return inferred;

  // Legacy rows: bill_purchase_type defaulted to "expense" while AI debit was inventory / asset
  if (explicit === "expense" && inferred !== "expense") {
    if (inferred === "inventory") {
      const hasInvSignal =
        Boolean(data.selected_item_id) ||
        data.guided_event_requires_item === true ||
        (Array.isArray(data.document_line_items) &&
          (data.document_line_items as Array<{ classification?: string }>).some((l) => l.classification === "inventory"));
      const debitId = getAiSuggestedDebitFromDraftData(data);
      const acc = debitId ? accounts.find((a) => a.id === debitId) : undefined;
      const debitLooksInventory =
        acc &&
        (acc.code?.trim() === "1200" ||
          /\binventory\b/i.test(acc.name ?? "") ||
          (acc.type === "asset" && acc.detail_type !== "fixed_asset"));
      if (hasInvSignal || debitLooksInventory) return "inventory";
    }
    if (inferred === "asset") {
      const fa = data.fixed_asset_draft as { asset_account_id?: string } | undefined;
      const debitId = getAiSuggestedDebitFromDraftData(data);
      const acc = debitId ? accounts.find((a) => a.id === debitId) : undefined;
      if (fa?.asset_account_id || acc?.detail_type === "fixed_asset") return "asset";
    }
  }

  return explicit;
}

/** Backward-compatible: default expense when nothing is stored (posting / journal resolution). */
export function parseBillPurchaseType(data: Record<string, unknown>): BillPurchaseClassification {
  return getExplicitBillPurchaseType(data) ?? "expense";
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

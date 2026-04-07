/**
 * Validates inventory-tracked sales invoice draft prerequisites and resolves COGS server-side.
 * Used by createGuidedInvoiceAction — do not trust client COGS/margin estimates.
 */

import { getInventoryBalance, getInventoryItem, type BusinessItem } from "@/lib/data/inventory";
import { calculateCOGSFIFO, calculateCOGSWeightedAverage } from "@/lib/inventory/valuation";
import { round2 } from "@/lib/posting/posting-engine";

export type ResolvedInventorySaleCosts = {
  unitCost: number;
  cogsAmount: number;
  margin: number;
};

function requireUuid(id: string | null | undefined, label: string): string {
  if (!id || typeof id !== "string") {
    throw new Error(`Cannot generate invoice draft: product is missing ${label} mapping.`);
  }
  return id;
}

/**
 * Server-side COGS for a proposed sale quantity (draft only — does not move inventory).
 */
export async function resolveInventorySaleCostsForDraft(params: {
  tenantId: string;
  item: BusinessItem;
  quantity: number;
  invoiceDate: string;
  revenueSubtotal: number;
  /** When the item has no revenue_account_id, use default sales account (e.g. code 4000). */
  defaultRevenueAccountId?: string | null;
}): Promise<ResolvedInventorySaleCosts> {
  const { tenantId, item, quantity, invoiceDate, revenueSubtotal, defaultRevenueAccountId } = params;

  const effectiveRevenueId = item.revenue_account_id ?? defaultRevenueAccountId ?? null;
  requireUuid(effectiveRevenueId, "revenue account");
  requireUuid(item.inventory_account_id, "inventory account");
  requireUuid(item.cogs_account_id, "COGS account");

  const invRow = await getInventoryItem(item.id);
  if (!invRow) {
    throw new Error("Cannot generate invoice draft: inventory record not found for this product.");
  }

  const balance = await getInventoryBalance(item.id);
  const onHand = balance ? Number(balance.quantity) : 0;
  if (onHand < quantity) {
    throw new Error(
      `Cannot generate invoice draft: insufficient stock available. Available: ${onHand}, required: ${quantity}.`,
    );
  }

  let cogsAmount: number;
  try {
    if (invRow.valuation_method === "fifo") {
      cogsAmount = await calculateCOGSFIFO(tenantId, item.id, quantity, invoiceDate);
    } else {
      cogsAmount = await calculateCOGSWeightedAverage(tenantId, item.id, quantity);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[resolveInventorySaleCostsForDraft] valuation RPC failed; falling back to average cost", {
      tenantId,
      itemId: item.id,
      quantity,
      error: msg,
    });
    const q = balance ? Number(balance.quantity) : 0;
    const tv = balance ? Number(balance.total_value) : 0;
    const fromAvg = balance?.average_cost != null ? Number(balance.average_cost) : null;
    const fromQv = q > 0 ? tv / q : null;
    const unitCost = Number(fromAvg ?? fromQv ?? item.cost_price ?? 0);
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      throw new Error(
        "Cannot generate invoice draft: no valid cost could be resolved for this product (FIFO/weighted average unavailable and no average cost on hand).",
      );
    }
    cogsAmount = round2(unitCost * quantity);
  }

  if (
    quantity > 0 &&
    (!Number.isFinite(cogsAmount) || cogsAmount <= 0)
  ) {
    throw new Error(
      "Cannot generate invoice draft: no valid cost layer found for valuation (COGS could not be computed).",
    );
  }

  const unitCost = quantity > 0 ? round2(cogsAmount / quantity) : 0;
  const margin = round2(revenueSubtotal - cogsAmount);

  return {
    unitCost,
    cogsAmount,
    margin,
  };
}

import { round2 } from "@/lib/posting/posting-engine";

/**
 * Inventory line from draft `inventory_line_items` when posting bills/invoices.
 */
export type DraftInventoryLine = {
  item_id: string;
  item_name: string;
  quantity: number;
  rate: number;
  unit_price?: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  /** Net line amount before tax (preferred when present). */
  revenue_amount?: number | null;
};

export type TransactionAmountsDraft = {
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
};

/**
 * Subtotal / tax / total for `invoices` and `bills` rows.
 * Prefers `transaction_amounts` from guided flows; otherwise infers from
 * `entities.amount` + `draft.tax_treatment` (exclusive = amount is net).
 */
export function deriveDocumentTotalsForMaterialize(params: {
  taxTreatment: "exclusive" | "inclusive" | null | undefined;
  entitiesAmount: number;
  entitiesTaxAmount: number | null;
  draftTaxAmountFallback: number | undefined;
  transactionAmounts: TransactionAmountsDraft | null | undefined;
}): { subtotal: number; taxAmount: number; totalAmount: number } {
  const tx = params.transactionAmounts;
  if (
    tx &&
    typeof tx.subtotal_amount === "number" &&
    typeof tx.tax_amount === "number" &&
    typeof tx.total_amount === "number"
  ) {
    return {
      subtotal: round2(tx.subtotal_amount),
      taxAmount: round2(tx.tax_amount),
      totalAmount: round2(tx.total_amount),
    };
  }

  const treatment = params.taxTreatment ?? "exclusive";
  const amount = round2(params.entitiesAmount);
  const taxFromEntities = params.entitiesTaxAmount;
  const taxAmt = round2(
    taxFromEntities ?? params.draftTaxAmountFallback ?? 0,
  );

  if (treatment === "inclusive") {
    const totalAmount = amount;
    const subtotal = round2(Math.max(totalAmount - taxAmt, 0));
    return { subtotal, taxAmount: taxAmt, totalAmount };
  }

  const subtotal = amount;
  const totalAmount = round2(subtotal + taxAmt);
  return { subtotal, taxAmount: taxAmt, totalAmount };
}

/**
 * Line amount before tax for PDF + `invoice_items` / `bill_items` line_total.
 */
export function lineNetAmountFromInventoryLine(line: DraftInventoryLine): number {
  if (typeof line.revenue_amount === "number" && !Number.isNaN(line.revenue_amount)) {
    return round2(line.revenue_amount);
  }
  return round2(Number(line.total) - Number(line.tax_amount ?? 0));
}

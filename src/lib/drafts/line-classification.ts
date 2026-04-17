import type { BusinessItem } from "@/lib/data/inventory";

export type BillLineKind = "inventory" | "expense" | "fixed_asset";
export type InvoiceLineKind = "product" | "service";

/** AED capitalization threshold: items at or above this cost are treated as fixed assets. */
export const CAPITALIZATION_THRESHOLD_AED = 1_000;

export function suggestBillLineClassification(item: BusinessItem | null): {
  classification: BillLineKind;
  confidence: number;
} {
  if (!item) return { classification: "expense", confidence: 0.35 };
  if (item.item_type === "product" && item.inventory_tracked) {
    return { classification: "inventory", confidence: 0.92 };
  }
  return { classification: "expense", confidence: 0.78 };
}

export function suggestInvoiceLineType(item: BusinessItem | null): {
  line_type: InvoiceLineKind;
  confidence: number;
} {
  if (!item) return { line_type: "service", confidence: 0.35 };
  if (item.item_type === "product" && item.inventory_tracked) {
    return { line_type: "product", confidence: 0.92 };
  }
  return { line_type: "service", confidence: 0.82 };
}

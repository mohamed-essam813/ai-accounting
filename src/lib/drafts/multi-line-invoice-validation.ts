/**
 * Pre-draft validation for multi-line sales invoices (explicit line-level errors).
 */

import type { BusinessItem } from "@/lib/data/inventory";
import { round2 } from "@/lib/posting/posting-engine";

export type InvoiceDraftLineInput = {
  line_type: "product" | "service";
  description: string;
  item_id: string;
  line_net: number;
  quantity?: number;
  unit_price?: number;
  tax_rate_id?: string | null;
};

export function linePrefix(lineIndex: number): string {
  return `Line ${lineIndex + 1}`;
}

/**
 * Validates each line against loaded item metadata. Throws Error with line prefix.
 */
export function assertInvoiceLinesValidForDraft(params: {
  lines: InvoiceDraftLineInput[];
  itemsById: Map<string, BusinessItem>;
  defaultRevenueAccountExists: boolean;
}): void {
  const { lines, itemsById, defaultRevenueAccountExists } = params;

  for (let i = 0; i < lines.length; i++) {
    const row = lines[i];
    const lp = linePrefix(i);
    const item = itemsById.get(row.item_id);

    if (!item) {
      throw new Error(
        `${lp}: selected item was not found. Select a valid product or service item from the catalog.`,
      );
    }

    const hasRevenue = Boolean(item.revenue_account_id) || defaultRevenueAccountExists;
    if (!hasRevenue) {
      throw new Error(
        `${lp}: "${item.name}" has no revenue account. Set one on the item or add default account code 4000.`,
      );
    }

    if (row.line_type === "product") {
      if (item.item_type !== "product" || !item.inventory_tracked) {
        throw new Error(
          `${lp}: "${item.name}" is not an inventory-tracked product. Change this line to Service or pick a stock product.`,
        );
      }
      if (!row.quantity || row.unit_price == null) {
        throw new Error(`${lp}: quantity and unit price are required for product lines.`);
      }
      const expected = round2(row.quantity * row.unit_price);
      if (Math.abs(expected - row.line_net) > 0.02) {
        throw new Error(
          `${lp}: amount does not match quantity × unit price (expected ${expected.toFixed(2)}).`,
        );
      }
      if (row.line_net < 0) {
        throw new Error(`${lp}: line amount cannot be negative.`);
      }
      if (!item.inventory_account_id || !item.cogs_account_id) {
        throw new Error(
          `${lp}: product "${item.name}" is missing inventory or COGS account mapping. Update the item in Inventory.`,
        );
      }
    } else {
      if (item.item_type === "product" && item.inventory_tracked) {
        throw new Error(
          `${lp}: "${item.name}" is inventory-tracked. Use line type Product or pick a non-stock service item.`,
        );
      }
      if (row.line_net <= 0) {
        throw new Error(`${lp}: enter a positive amount before tax for this service line.`);
      }
    }
  }
}

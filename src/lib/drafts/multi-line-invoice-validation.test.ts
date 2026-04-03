import { describe, expect, it } from "vitest";
import { assertInvoiceLinesValidForDraft } from "./multi-line-invoice-validation";
import type { BusinessItem } from "@/lib/data/inventory";

const rev = "00000000-0000-4000-8000-000000000001";
const invAcc = "00000000-0000-4000-8000-000000000002";
const cogsAcc = "00000000-0000-4000-8000-000000000003";

function item(partial: Partial<BusinessItem> & Pick<BusinessItem, "id" | "name">): BusinessItem {
  const { id, name, ...rest } = partial;
  return {
    id,
    name,
    tenant_id: "t1",
    sku: null,
    description: null,
    unit: "ea",
    uom_id: null,
    valuation_method: "fifo",
    inventory_account_id: null,
    cogs_account_id: null,
    is_active: true,
    created_at: "",
    updated_at: "",
    item_type: "service",
    inventory_tracked: false,
    revenue_account_id: rev,
    expense_account_id: null,
    default_tax_rate_id: null,
    selling_price: null,
    cost_price: null,
    keywords: null,
    ...rest,
  } as BusinessItem;
}

describe("assertInvoiceLinesValidForDraft", () => {
  const defaultRev = true;

  it("accepts single product + single service line when mappings exist", () => {
    const product = item({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "PRINTER",
      item_type: "product",
      inventory_tracked: true,
      revenue_account_id: rev,
      inventory_account_id: invAcc,
      cogs_account_id: cogsAcc,
    });
    const service = item({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Delivery",
      item_type: "service",
      inventory_tracked: false,
    });
    const map = new Map<string, BusinessItem>([
      [product.id, product],
      [service.id, service],
    ]);
    expect(() =>
      assertInvoiceLinesValidForDraft({
        lines: [
          {
            line_type: "product",
            description: "PRINTER",
            item_id: product.id,
            line_net: 5000,
            quantity: 5,
            unit_price: 1000,
          },
          {
            line_type: "service",
            description: "Delivery fee",
            item_id: service.id,
            line_net: 100,
          },
        ],
        itemsById: map,
        defaultRevenueAccountExists: defaultRev,
      }),
    ).not.toThrow();
  });

  it("throws for product line missing COGS mapping", () => {
    const bad = item({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "X",
      item_type: "product",
      inventory_tracked: true,
      inventory_account_id: null,
      cogs_account_id: null,
    });
    expect(() =>
      assertInvoiceLinesValidForDraft({
        lines: [
          {
            line_type: "product",
            description: "X",
            item_id: bad.id,
            line_net: 10,
            quantity: 1,
            unit_price: 10,
          },
        ],
        itemsById: new Map([[bad.id, bad]]),
        defaultRevenueAccountExists: defaultRev,
      }),
    ).toThrow(/Line 1:.*inventory or COGS account mapping/i);
  });

  it("throws when service line uses inventory-tracked product item", () => {
    const inv = item({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      name: "Stock SKU",
      item_type: "product",
      inventory_tracked: true,
    });
    expect(() =>
      assertInvoiceLinesValidForDraft({
        lines: [
          {
            line_type: "service",
            description: "wrong",
            item_id: inv.id,
            line_net: 50,
          },
        ],
        itemsById: new Map([[inv.id, inv]]),
        defaultRevenueAccountExists: defaultRev,
      }),
    ).toThrow(/Line 1:.*inventory-tracked/i);
  });

  it("throws when quantity × price does not match line net", () => {
    const p = item({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      name: "P",
      item_type: "product",
      inventory_tracked: true,
      inventory_account_id: invAcc,
      cogs_account_id: cogsAcc,
    });
    expect(() =>
      assertInvoiceLinesValidForDraft({
        lines: [
          {
            line_type: "product",
            description: "P",
            item_id: p.id,
            line_net: 999,
            quantity: 2,
            unit_price: 10,
          },
        ],
        itemsById: new Map([[p.id, p]]),
        defaultRevenueAccountExists: defaultRev,
      }),
    ).toThrow(/Line 1:.*quantity × unit price/i);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BusinessItem } from "@/lib/data/inventory";
import { resolveInventorySaleCostsForDraft } from "./guided-invoice-inventory-validation";

vi.mock("@/lib/data/inventory", () => ({
  getInventoryBalance: vi.fn(),
  getInventoryItem: vi.fn(),
}));

vi.mock("@/lib/inventory/valuation", () => ({
  calculateCOGSFIFO: vi.fn(),
  calculateCOGSWeightedAverage: vi.fn(),
}));

import { getInventoryBalance, getInventoryItem } from "@/lib/data/inventory";
import { calculateCOGSFIFO, calculateCOGSWeightedAverage } from "@/lib/inventory/valuation";

const mockBalance = vi.mocked(getInventoryBalance);
const mockGetInventoryItem = vi.mocked(getInventoryItem);
const mockFifo = vi.mocked(calculateCOGSFIFO);
const mockWa = vi.mocked(calculateCOGSWeightedAverage);

function makeItem(over: Partial<BusinessItem> = {}): BusinessItem {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    tenant_id: "b0000000-0000-4000-8000-000000000001",
    name: "Robot cleaner",
    sku: null,
    description: null,
    unit: "ea",
    valuation_method: "fifo",
    inventory_account_id: "c0000000-0000-4000-8000-000000000001",
    cogs_account_id: "d0000000-0000-4000-8000-000000000001",
    is_active: true,
    created_at: "",
    updated_at: "",
    item_type: "product",
    inventory_tracked: true,
    revenue_account_id: "e0000000-0000-4000-8000-000000000001",
    expense_account_id: null,
    default_tax_rate_id: null,
    selling_price: null,
    cost_price: 1000,
    keywords: null,
    ...over,
  };
}

describe("resolveInventorySaleCostsForDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInventoryItem.mockResolvedValue({
      id: "a0000000-0000-4000-8000-000000000001",
      tenant_id: "b0000000-0000-4000-8000-000000000001",
      name: "Robot cleaner",
      sku: null,
      description: null,
      unit: "ea",
      valuation_method: "fifo",
      inventory_account_id: "c0000000-0000-4000-8000-000000000001",
      cogs_account_id: "d0000000-0000-4000-8000-000000000001",
      is_active: true,
      created_at: "",
      updated_at: "",
    } as Awaited<ReturnType<typeof getInventoryItem>>);
    mockBalance.mockResolvedValue({
      quantity: 100,
      total_value: 100000,
      average_cost: 1000,
    } as Awaited<ReturnType<typeof getInventoryBalance>>);
  });

  it("computes COGS and margin from FIFO when stock is sufficient (Test 1 style)", async () => {
    mockFifo.mockResolvedValue(10000);
    const item = makeItem();
    const r = await resolveInventorySaleCostsForDraft({
      tenantId: item.tenant_id,
      item,
      quantity: 10,
      invoiceDate: "2026-04-02",
      revenueSubtotal: 20000,
    });
    expect(r.cogsAmount).toBe(10000);
    expect(r.unitCost).toBe(1000);
    expect(r.margin).toBe(10000);
    expect(mockFifo).toHaveBeenCalledWith(item.tenant_id, item.id, 10, "2026-04-02");
    expect(mockWa).not.toHaveBeenCalled();
  });

  it("rejects missing revenue account mapping when no default", async () => {
    await expect(
      resolveInventorySaleCostsForDraft({
        tenantId: "b0000000-0000-4000-8000-000000000001",
        item: makeItem({ revenue_account_id: null }),
        quantity: 1,
        invoiceDate: "2026-04-02",
        revenueSubtotal: 100,
      }),
    ).rejects.toThrow(/revenue account/i);
  });

  it("accepts default revenue account when item has none", async () => {
    mockFifo.mockResolvedValue(1000);
    const item = makeItem({ revenue_account_id: null });
    const r = await resolveInventorySaleCostsForDraft({
      tenantId: item.tenant_id,
      item,
      quantity: 1,
      invoiceDate: "2026-04-02",
      revenueSubtotal: 5000,
      defaultRevenueAccountId: "e0000000-0000-4000-8000-000000000099",
    });
    expect(r.cogsAmount).toBe(1000);
  });

  it("rejects missing inventory account mapping", async () => {
    await expect(
      resolveInventorySaleCostsForDraft({
        tenantId: "b0000000-0000-4000-8000-000000000001",
        item: makeItem({ inventory_account_id: null }),
        quantity: 1,
        invoiceDate: "2026-04-02",
        revenueSubtotal: 100,
      }),
    ).rejects.toThrow(/inventory account/i);
  });

  it("rejects missing COGS account mapping", async () => {
    await expect(
      resolveInventorySaleCostsForDraft({
        tenantId: "b0000000-0000-4000-8000-000000000001",
        item: makeItem({ cogs_account_id: null }),
        quantity: 1,
        invoiceDate: "2026-04-02",
        revenueSubtotal: 100,
      }),
    ).rejects.toThrow(/COGS account/i);
  });

  it("rejects insufficient stock", async () => {
    mockBalance.mockResolvedValue({
      quantity: 5,
      total_value: 5000,
      average_cost: 1000,
    } as Awaited<ReturnType<typeof getInventoryBalance>>);
    await expect(
      resolveInventorySaleCostsForDraft({
        tenantId: "b0000000-0000-4000-8000-000000000001",
        item: makeItem(),
        quantity: 10,
        invoiceDate: "2026-04-02",
        revenueSubtotal: 20000,
      }),
    ).rejects.toThrow(/insufficient stock/i);
  });

  it("rejects when valuation fails and no fallback cost exists", async () => {
    mockFifo.mockRejectedValue(new Error("RPC failed"));
    mockBalance.mockResolvedValue({
      quantity: 10,
      total_value: 0,
      average_cost: null,
    } as Awaited<ReturnType<typeof getInventoryBalance>>);
    await expect(
      resolveInventorySaleCostsForDraft({
        tenantId: "b0000000-0000-4000-8000-000000000001",
        item: makeItem({ cost_price: null }),
        quantity: 10,
        invoiceDate: "2026-04-02",
        revenueSubtotal: 20000,
      }),
    ).rejects.toThrow(/no valid cost/i);
  });

  it("uses weighted average when valuation method is not fifo", async () => {
    mockGetInventoryItem.mockResolvedValue({
      id: "a0000000-0000-4000-8000-000000000001",
      tenant_id: "b0000000-0000-4000-8000-000000000001",
      name: "Robot cleaner",
      sku: null,
      description: null,
      unit: "ea",
      valuation_method: "weighted_average",
      inventory_account_id: "c0000000-0000-4000-8000-000000000001",
      cogs_account_id: "d0000000-0000-4000-8000-000000000001",
      is_active: true,
      created_at: "",
      updated_at: "",
    } as Awaited<ReturnType<typeof getInventoryItem>>);
    mockWa.mockResolvedValue(5000);
    const item = makeItem({ valuation_method: "weighted_average" });
    const r = await resolveInventorySaleCostsForDraft({
      tenantId: item.tenant_id,
      item,
      quantity: 5,
      invoiceDate: "2026-04-02",
      revenueSubtotal: 10000,
    });
    expect(r.cogsAmount).toBe(5000);
    expect(mockWa).toHaveBeenCalledWith(item.tenant_id, item.id, 5);
  });
});

/**
 * Inventory Data Access Layer
 * MVP Feedback Section 7: Inventory (FIFO / Weighted Average)
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";
import { normalizeEntityName } from "@/lib/utils/entity-dedupe";

type InventoryItemRow = Database["public"]["Tables"]["inventory_items"]["Row"];
type InventoryTransactionRow = Database["public"]["Tables"]["inventory_transactions"]["Row"];
type InventoryBalanceRow = Database["public"]["Tables"]["inventory_balances"]["Row"];

export interface InventoryItem {
  id: string;
  tenant_id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unit: string; // Deprecated - use uom_id instead, kept for backward compatibility
  uom_id?: string | null; // New field - links to units_of_measure
  valuation_method: "fifo" | "weighted_average";
  inventory_account_id?: string | null; // Account ID for inventory asset (default: code 1200)
  cogs_account_id?: string | null; // Account ID for cost of goods sold (default: code 5500)
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Full item row for prompts / posting (extends inventory item with accounting fields). */
export interface BusinessItem extends InventoryItem {
  item_type: "product" | "service";
  inventory_tracked: boolean;
  revenue_account_id: string | null;
  expense_account_id: string | null;
  default_tax_rate_id: string | null;
  selling_price: number | null;
  cost_price: number | null;
  keywords: string | null;
}

function rowToBusinessItem(row: InventoryItemRow): BusinessItem {
  const base = rowToInventoryItem(row);
  const r = row as InventoryItemRow & {
    item_type?: string;
    inventory_tracked?: boolean;
    revenue_account_id?: string | null;
    expense_account_id?: string | null;
    default_tax_rate_id?: string | null;
    selling_price?: number | null;
    cost_price?: number | null;
    keywords?: string | null;
  };
  const it = (r as { item_type?: string }).item_type;
  return {
    ...base,
    item_type: it === "service" ? "service" : "product",
    inventory_tracked: (r as { inventory_tracked?: boolean }).inventory_tracked !== false,
    revenue_account_id: r.revenue_account_id ?? null,
    expense_account_id: r.expense_account_id ?? null,
    default_tax_rate_id: r.default_tax_rate_id ?? null,
    selling_price: r.selling_price != null ? Number(r.selling_price) : null,
    cost_price: r.cost_price != null ? Number(r.cost_price) : null,
    keywords: r.keywords ?? null,
  };
}

function rowToInventoryItem(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    sku: row.sku,
    description: row.description,
    unit: row.unit,
    valuation_method: row.valuation_method as "fifo" | "weighted_average",
    inventory_account_id: row.inventory_account_id || null,
    cogs_account_id: row.cogs_account_id || null,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface InventoryTransaction {
  id: string;
  tenant_id: string;
  item_id: string;
  transaction_type: "purchase" | "sale" | "adjustment" | "return";
  date: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  batch_number: number | null;
  cogs_amount: number | null;
  journal_entry_id: string | null;
  draft_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface InventoryBalance {
  id: string;
  tenant_id: string;
  item_id: string;
  quantity: number;
  average_cost: number | null;
  total_value: number;
  last_transaction_date: string | null;
  updated_at: string;
}

export interface InventorySummary {
  item_id: string;
  item_name: string;
  sku: string | null;
  valuation_method: "fifo" | "weighted_average";
  quantity: number;
  average_cost: number | null;
  total_value: number;
  last_transaction_date: string | null;
  quantity_0_30: number;
  quantity_31_60: number;
  quantity_61_90: number;
  quantity_90_plus: number;
}

/**
 * Get all inventory items for the current tenant
 */
export async function getInventoryItems(): Promise<InventoryItem[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const table = supabase.from("inventory_items") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string) => Promise<{
          data: InventoryItemRow[] | null;
          error: unknown;
        }>;
      };
    };
  };

  const { data, error } = await table
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("name");

  if (error) {
    console.error("Failed to fetch inventory items:", error);
    return [];
  }

  return (data || []).map((row) => rowToInventoryItem(row));
}

/** Prevent duplicate product/service rows that differ only by spacing or case. */
export async function findActiveItemByNormalizedName(
  rawName: string,
): Promise<{ id: string; name: string } | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }
  const target = normalizeEntityName(rawName);
  if (!target) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, name")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true);

  if (error) {
    console.error("findActiveItemByNormalizedName", error);
    throw error;
  }

  const hit = (data ?? []).find((r) => normalizeEntityName(r.name) === target);
  return hit ? { id: hit.id, name: hit.name } : null;
}

/**
 * Search items by name, SKU, or keywords (in-memory filter; suitable for typical tenant sizes).
 */
export async function searchBusinessItems(query: string, limit = 40): Promise<BusinessItem[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true)
    .order("name")
    .limit(500);

  if (error) {
    console.error("searchBusinessItems", error);
    return [];
  }

  const q = query.trim().toLowerCase();
  const rows = (data || []).filter((row) => {
    if (!q) return true;
    const name = (row.name || "").toLowerCase();
    const sku = (row.sku || "").toLowerCase();
    const kw = ((row as { keywords?: string | null }).keywords || "").toLowerCase();
    return name.includes(q) || sku.includes(q) || kw.includes(q);
  });

  return rows.slice(0, limit).map((row) => rowToBusinessItem(row as InventoryItemRow));
}

export async function getBusinessItemById(itemId: string): Promise<BusinessItem | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    console.error("getBusinessItemById", error);
    return null;
  }
  if (!data) return null;

  return rowToBusinessItem(data as InventoryItemRow);
}

/**
 * Get inventory summary (with ageing breakdown)
 */
export async function getInventorySummary(): Promise<InventorySummary[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const view = supabase.from("v_inventory_summary") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string) => Promise<{
          data: Array<{
            tenant_id: string;
            item_id: string;
            item_name: string;
            sku: string | null;
            valuation_method: string;
            quantity: number;
            average_cost: number | null;
            total_value: number;
            last_transaction_date: string | null;
            quantity_0_30: number;
            quantity_31_60: number;
            quantity_61_90: number;
            quantity_90_plus: number;
          }> | null;
          error: unknown;
        }>;
      };
    };
  };

  const { data, error } = await view
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("item_name");

  if (error) {
    console.error("Failed to fetch inventory summary:", error);
    return [];
  }

  return (data || []).map((row) => ({
    item_id: row.item_id,
    item_name: row.item_name,
    sku: row.sku,
    valuation_method: row.valuation_method as "fifo" | "weighted_average",
    quantity: Number(row.quantity),
    average_cost: row.average_cost ? Number(row.average_cost) : null,
    total_value: Number(row.total_value),
    last_transaction_date: row.last_transaction_date,
    quantity_0_30: Number(row.quantity_0_30),
    quantity_31_60: Number(row.quantity_31_60),
    quantity_61_90: Number(row.quantity_61_90),
    quantity_90_plus: Number(row.quantity_90_plus),
  }));
}

/**
 * Get inventory balance for a specific item
 */
export async function getInventoryBalance(itemId: string): Promise<InventoryBalance | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const table = supabase.from("inventory_balances") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: InventoryBalanceRow | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const { data, error } = await table
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("item_id", itemId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch inventory balance:", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    tenant_id: data.tenant_id,
    item_id: data.item_id,
    quantity: Number(data.quantity),
    average_cost: data.average_cost ? Number(data.average_cost) : null,
    total_value: Number(data.total_value),
    last_transaction_date: data.last_transaction_date,
    updated_at: data.updated_at,
  };
}

/**
 * Get inventory transactions for an item
 */
export async function getInventoryTransactions(
  itemId: string,
  limit: number = 50,
): Promise<InventoryTransaction[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const table = supabase.from("inventory_transactions") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options?: { ascending?: boolean }) => {
            limit: (count: number) => Promise<{
              data: InventoryTransactionRow[] | null;
              error: unknown;
            }>;
          };
        };
      };
    };
  };

  const { data, error } = await table
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("item_id", itemId)
    .order("date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch inventory transactions:", error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    item_id: row.item_id,
    transaction_type: row.transaction_type as "purchase" | "sale" | "adjustment" | "return",
    date: row.date,
    quantity: Number(row.quantity),
    unit_cost: Number(row.unit_cost),
    total_cost: Number(row.total_cost),
    batch_number: row.batch_number,
    cogs_amount: row.cogs_amount ? Number(row.cogs_amount) : null,
    journal_entry_id: row.journal_entry_id,
    draft_id: row.draft_id,
    notes: row.notes,
    created_at: row.created_at,
  }));
}

export interface InventoryAgeing {
  id: string;
  item_id: string;
  batch_number: number | null;
  purchase_date: string;
  quantity: number;
  unit_cost: number;
  total_value: number;
  days_in_stock: number;
  ageing_bucket: "0-30" | "31-60" | "61-90" | "90+";
  created_at: string;
}

/**
 * Get inventory ageing data for a specific item
 */
export async function getInventoryAgeing(itemId: string): Promise<InventoryAgeing[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  type InventoryAgeingRow = Database["public"]["Tables"]["inventory_ageing"]["Row"];
  
  const table = supabase.from("inventory_ageing") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options?: { ascending?: boolean }) => Promise<{
            data: InventoryAgeingRow[] | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const { data, error } = await table
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("item_id", itemId)
    .order("purchase_date", { ascending: true });

  if (error) {
    console.error("Failed to fetch inventory ageing:", error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    item_id: row.item_id,
    batch_number: row.batch_number,
    purchase_date: row.purchase_date,
    quantity: Number(row.quantity),
    unit_cost: Number(row.unit_cost),
    total_value: Number(row.total_value),
    days_in_stock: Number(row.days_in_stock),
    ageing_bucket: row.ageing_bucket as "0-30" | "31-60" | "61-90" | "90+",
    created_at: row.created_at,
  }));
}

/**
 * Get a single inventory item by ID
 */
export async function getInventoryItem(itemId: string): Promise<InventoryItem | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const table = supabase.from("inventory_items") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: InventoryItemRow | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const { data, error } = await table
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch inventory item:", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    tenant_id: data.tenant_id,
    name: data.name,
    sku: data.sku,
    description: data.description,
    unit: data.unit,
    valuation_method: data.valuation_method as "fifo" | "weighted_average",
    inventory_account_id: (data as any).inventory_account_id || null,
    cogs_account_id: (data as any).cogs_account_id || null,
    is_active: data.is_active,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}


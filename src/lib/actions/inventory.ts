/**
 * Inventory Actions (Server Actions)
 */

"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CreateInventoryItemSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  sku: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  uom_id: z.string().uuid("Valid unit of measure is required"),
  // unit field deprecated - use uom_id instead
  // valuation_method removed - now inherited from tenant policy
});

const UpdateInventoryItemSchema = CreateInventoryItemSchema.extend({
  id: z.string().uuid(),
  is_active: z.boolean().optional(),
});

export async function createInventoryItemAction(
  input: z.infer<typeof CreateInventoryItemSchema>,
) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved");
  }

  const payload = CreateInventoryItemSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  // Get valuation method from tenant accounting policy (using type assertion since table may not be in generated types yet)
  const { data: policy } = await supabase
    .from("accounting_policies" as any)
    .select("inventory_valuation_method")
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  const valuationMethod = ((policy as any)?.inventory_valuation_method || "fifo") as
    | "fifo"
    | "weighted_average"
    | "specific_identification";

  // Get default inventory and COGS accounts
  const { getAccountByCode } = await import("@/lib/data/accounts");
  const inventoryAccount = await getAccountByCode("1200");
  const cogsAccount = await getAccountByCode("5500");

  if (!inventoryAccount || !cogsAccount) {
    throw new Error("Default inventory (1200) or COGS (5500) accounts not found. Please create them in Chart of Accounts.");
  }

  // Check if SKU already exists (if provided)
  if (payload.sku) {
    const { data: existing } = await supabase
      .from("inventory_items")
      .select("id")
      .eq("tenant_id", user.tenant.id)
      .eq("sku", payload.sku)
      .maybeSingle();

    if (existing) {
      throw new Error("An item with this SKU already exists");
    }
  }

  // Validate UOM exists and belongs to tenant
  const { data: uom } = await (supabase.from("units_of_measure" as any) as any)
    .select("id")
    .eq("id", payload.uom_id)
    .eq("tenant_id", user.tenant.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!uom) {
    throw new Error("Selected unit of measure not found or inactive");
  }

  // Use type assertion since inventory_items may have uom_id column (migration may not have run yet)
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      tenant_id: user.tenant.id,
      name: payload.name,
      sku: payload.sku || null,
      description: payload.description || null,
      item_type: "product",
      inventory_tracked: true,
      // Try uom_id first, fallback to unit if column doesn't exist yet
      uom_id: payload.uom_id,
      // Keep unit as fallback for backward compatibility (migration will handle it)
      unit: "unit", // Placeholder, will be migrated by migration script
      valuation_method: valuationMethod, // Inherited from tenant policy
      inventory_account_id: inventoryAccount.id, // Set default inventory account
      cogs_account_id: cogsAccount.id, // Set default COGS account
    } as any)
    .select()
    .single();

  if (error) {
    throw error;
  }

  // Create initial balance record (zero quantity)
  await supabase.from("inventory_balances").insert({
    tenant_id: user.tenant.id,
    item_id: data.id,
    quantity: 0,
    total_value: 0,
  });

  revalidatePath("/inventory");
  return data;
}

export async function updateInventoryItemAction(
  input: z.infer<typeof UpdateInventoryItemSchema>,
) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved");
  }

  const payload = UpdateInventoryItemSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  // Verify item belongs to tenant
  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("id", payload.id)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (!existing) {
    throw new Error("Inventory item not found");
  }

  // Check if SKU change conflicts with existing SKU
  if (payload.sku) {
    const { data: skuConflict } = await supabase
      .from("inventory_items")
      .select("id")
      .eq("tenant_id", user.tenant.id)
      .eq("sku", payload.sku)
      .neq("id", payload.id)
      .maybeSingle();

    if (skuConflict) {
      throw new Error("An item with this SKU already exists");
    }
  }

  // Validate UOM if provided
  if (payload.uom_id) {
    const { data: uom } = await (supabase.from("units_of_measure" as any) as any)
      .select("id")
      .eq("id", payload.uom_id)
      .eq("tenant_id", user.tenant.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!uom) {
      throw new Error("Selected unit of measure not found or inactive");
    }
  }

  // Update item (using type assertion since inventory_items may have uom_id column)
  const { data, error } = await supabase
    .from("inventory_items")
    .update({
      name: payload.name,
      sku: payload.sku || null,
      description: payload.description || null,
      uom_id: payload.uom_id,
      is_active: payload.is_active !== undefined ? payload.is_active : true,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", payload.id)
    .eq("tenant_id", user.tenant.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  revalidatePath("/inventory");
  return data;
}

// Server action to list inventory items (for use in client components)
export async function listInventoryItemsAction() {
  const { getInventoryItems } = await import("@/lib/data/inventory");
  return await getInventoryItems();
}

export async function deactivateInventoryItemAction(itemId: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved");
  }

  const supabase = await createServerSupabaseClient();

  // Soft delete by setting is_active to false
  const { error } = await supabase
    .from("inventory_items")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("tenant_id", user.tenant.id);

  if (error) {
    throw error;
  }

  revalidatePath("/inventory");
}
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
  unit: z.string().default("unit"),
  // valuation_method removed - now inherited from tenant policy
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

  const valuationMethod = ((policy as any)?.inventory_valuation_method || "fifo") as "fifo" | "weighted_average";

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

  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      tenant_id: user.tenant.id,
      name: payload.name,
      sku: payload.sku || null,
      description: payload.description || null,
      unit: payload.unit,
      valuation_method: valuationMethod, // Inherited from tenant policy
    })
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


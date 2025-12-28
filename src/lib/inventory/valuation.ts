/**
 * Inventory Valuation Logic
 * MVP Feedback Section 7: FIFO and Weighted Average methods
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";

export type ValuationMethod = "fifo" | "weighted_average";

/**
 * Calculate COGS for a sale using FIFO method
 * MVP Feedback: FIFO Example - Buy 10 @ 10, Buy 10 @ 12, Sell 10 → COGS = 100 (first batch)
 */
export async function calculateCOGSFIFO(
  tenantId: string,
  itemId: string,
  quantity: number,
  date: string,
): Promise<number> {
  const supabase = await createServerSupabaseClient();

  // Call the database function
  const { data, error } = await supabase.rpc("calculate_cogs_fifo", {
    p_tenant_id: tenantId,
    p_item_id: itemId,
    p_quantity: quantity,
    p_date: date,
  });

  if (error) {
    console.error("Failed to calculate COGS (FIFO):", error);
    throw error;
  }

  return Number(data || 0);
}

/**
 * Calculate COGS for a sale using Weighted Average method
 */
export async function calculateCOGSWeightedAverage(
  tenantId: string,
  itemId: string,
  quantity: number,
): Promise<number> {
  const supabase = await createServerSupabaseClient();

  // Call the database function
  const { data, error } = await supabase.rpc("calculate_cogs_weighted_average", {
    p_tenant_id: tenantId,
    p_item_id: itemId,
    p_quantity: quantity,
  });

  if (error) {
    console.error("Failed to calculate COGS (Weighted Average):", error);
    throw error;
  }

  return Number(data || 0);
}

/**
 * Update inventory balance after a purchase (both methods)
 */
export async function updateInventoryBalanceAfterPurchase(
  tenantId: string,
  itemId: string,
  quantity: number,
  unitCost: number,
  valuationMethod: ValuationMethod,
  date: string,
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  // Get current balance
  const { data: currentBalance } = await supabase
    .from("inventory_balances")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .maybeSingle();

  const totalCost = quantity * unitCost;

  if (currentBalance) {
    // Update existing balance
    if (valuationMethod === "weighted_average") {
      // Weighted Average: Calculate new average cost
      const currentQuantity = Number(currentBalance.quantity);
      const currentValue = Number(currentBalance.total_value);
      const newQuantity = currentQuantity + quantity;
      const newValue = currentValue + totalCost;
      const newAverageCost = newQuantity > 0 ? newValue / newQuantity : 0;

      await supabase
        .from("inventory_balances")
        .update({
          quantity: newQuantity,
          total_value: newValue,
          average_cost: newAverageCost,
          last_transaction_date: date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentBalance.id);
    } else {
      // FIFO: Just update quantity and value (batches tracked in inventory_ageing)
      const newQuantity = Number(currentBalance.quantity) + quantity;
      const newValue = Number(currentBalance.total_value) + totalCost;

      await supabase
        .from("inventory_balances")
        .update({
          quantity: newQuantity,
          total_value: newValue,
          last_transaction_date: date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentBalance.id);
    }
  } else {
    // Create new balance
    const balanceData: any = {
      tenant_id: tenantId,
      item_id: itemId,
      quantity,
      total_value: totalCost,
      last_transaction_date: date,
    };

    if (valuationMethod === "weighted_average") {
      balanceData.average_cost = unitCost;
    }

    await supabase.from("inventory_balances").insert(balanceData);
  }

  // Update inventory ageing for FIFO
  if (valuationMethod === "fifo") {
    // Get next batch number
    const { data: lastBatch } = await supabase
      .from("inventory_ageing")
      .select("batch_number")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .order("batch_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextBatchNumber = lastBatch?.batch_number ? lastBatch.batch_number + 1 : 1;
    const daysInStock = 0; // New purchase
    const ageingBucket = "0-30";

    await supabase.from("inventory_ageing").insert({
      tenant_id: tenantId,
      item_id: itemId,
      batch_number: nextBatchNumber,
      purchase_date: date,
      quantity,
      unit_cost: unitCost,
      total_value: totalCost,
      days_in_stock: daysInStock,
      ageing_bucket: ageingBucket,
    });
  }
}

/**
 * Update inventory balance after a sale
 */
export async function updateInventoryBalanceAfterSale(
  tenantId: string,
  itemId: string,
  quantity: number,
  cogsAmount: number,
  date: string,
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  // Get current balance
  const { data: currentBalance } = await supabase
    .from("inventory_balances")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (!currentBalance) {
    throw new Error("Inventory balance not found");
  }

  const newQuantity = Number(currentBalance.quantity) - quantity;
  const newValue = Number(currentBalance.total_value) - cogsAmount;

  if (newQuantity < 0) {
    throw new Error("Insufficient inventory quantity");
  }

  await supabase
    .from("inventory_balances")
    .update({
      quantity: newQuantity,
      total_value: newValue,
      last_transaction_date: date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", currentBalance.id);
}

/**
 * Update inventory ageing (called periodically to update days_in_stock)
 */
export async function updateInventoryAgeing(tenantId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  // Update all ageing records with current days in stock
  const { error } = await supabase.rpc("update_inventory_ageing", {
    p_tenant_id: tenantId,
  });

  if (error) {
    console.error("Failed to update inventory ageing:", error);
    // Don't throw - this is a background task
  }
}


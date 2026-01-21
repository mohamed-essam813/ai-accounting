/**
 * Accounting Policies Actions (Server Actions)
 * Admin-only actions for managing tenant-level accounting policies
 */

"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManageAccounts } from "@/lib/auth";

const UpdateInventoryValuationSchema = z.object({
  valuation_method: z.enum(["fifo", "weighted_average"]),
  effective_date: z.string().optional(),
  reason: z.string().min(10, "Reason for change is required (minimum 10 characters)"),
});

/**
 * Check if inventory transactions exist for the tenant
 */
async function hasInventoryTransactions(tenantId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("inventory_transactions" as never)
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

/**
 * Update inventory valuation method (Admin only, with restrictions)
 */
export async function updateInventoryValuationMethodAction(
  input: z.infer<typeof UpdateInventoryValuationSchema>,
) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved");
  }

  // Check admin permission
  if (!canManageAccounts(user.role as "admin" | "accountant" | "business_user" | "auditor")) {
    throw new Error("Only administrators can change accounting policies");
  }

  const payload = UpdateInventoryValuationSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  // Check if inventory transactions exist
  const hasTransactions = await hasInventoryTransactions(user.tenant.id);
  if (hasTransactions) {
    // For MVP: Block changes after transactions exist
    // In future: Could allow with revaluation logic
    throw new Error(
      "Cannot change inventory valuation method after inventory transactions exist. " +
        "This would require revaluation of all existing inventory balances."
    );
  }

  // Get current policy (using type assertion since table may not be in generated types yet)
  const { data: currentPolicy } = await supabase
    .from("accounting_policies" as any)
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  const previousValue = (currentPolicy as any)?.inventory_valuation_method || "fifo";

  // Update policy (using type assertion since table may not be in generated types yet)
  const effectiveDate = payload.effective_date || new Date().toISOString().split("T")[0];
  
  const { data: updatedPolicy, error: updateError } = await supabase
    .from("accounting_policies" as any)
    .upsert(
      {
        tenant_id: user.tenant.id,
        inventory_valuation_method: payload.valuation_method,
        effective_date: effectiveDate,
        updated_at: new Date().toISOString(),
      } as any,
      {
        onConflict: "tenant_id",
      }
    )
    .select()
    .single();

  if (updateError) throw updateError;

  // Log the change (using type assertion since table may not be in generated types yet)
  const { error: logError } = await supabase
    .from("accounting_policy_changes" as any)
    .insert({
      tenant_id: user.tenant.id,
      policy_type: "inventory_valuation_method",
      previous_value: previousValue,
      new_value: payload.valuation_method,
      changed_by: user.id,
      reason: payload.reason,
      effective_date: effectiveDate,
    } as any);

  if (logError) throw logError;

  // Also log to audit_logs
  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "update",
    entity: "accounting_policy",
    entity_id: (updatedPolicy as any)?.id || null,
    changes: {
      policy_type: "inventory_valuation_method",
      previous_value: previousValue,
      new_value: payload.valuation_method,
      reason: payload.reason,
    },
  });

  revalidatePath("/settings/tenant");
  return updatedPolicy;
}


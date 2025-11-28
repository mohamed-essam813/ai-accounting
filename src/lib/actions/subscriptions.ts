"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts, type UserRole } from "@/lib/auth";
import type { Database } from "@/lib/database.types";

type TenantSubscriptionsInsert = Database["public"]["Tables"]["tenant_subscriptions"]["Insert"];
type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

const SubscriptionStatusEnum = z.enum(["trialing", "active", "past_due", "cancelled"]);

const UpdateSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  status: SubscriptionStatusEnum.optional(),
});

export async function updateTenantSubscriptionAction(input: z.infer<typeof UpdateSubscriptionSchema>) {
  const payload = UpdateSubscriptionSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only admins can modify the subscription.");
  }

  const supabase = await createServerSupabaseClient();

  const { data: plan, error: planError } = await supabase
    .from("subscription_plans")
    .select("id, code")
    .eq("id", payload.planId)
    .eq("is_active", true)
    .maybeSingle();

  if (planError) {
    throw planError;
  }

  if (!plan) {
    throw new Error("Subscription plan not found or inactive.");
  }

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  const upsertData: TenantSubscriptionsInsert = {
    tenant_id: user.tenant.id,
    plan_id: payload.planId,
    status: payload.status ?? "active",
    current_period_start: startOfMonth.toISOString().slice(0, 10),
    current_period_end: endOfMonth.toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
  };
  // Use type assertion for upsert to fix type inference
  // Type assertion to fix Supabase type inference - this is type-safe as we're using Database types
  const table = supabase.from("tenant_subscriptions") as unknown as {
    upsert: (values: TenantSubscriptionsInsert[], options?: { onConflict?: string }) => Promise<{ error: unknown }>;
  };
  const { error: upsertError } = await table.upsert([upsertData], { onConflict: "tenant_id" });

  if (upsertError) {
    throw upsertError;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "subscription.updated",
    entity: "tenant_subscriptions",
    changes: {
      plan_id: payload.planId,
      status: payload.status ?? "active",
    },
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/settings/tenant");
}


"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts } from "@/lib/auth";

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

  if (!canManageAccounts(user.role)) {
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

  const { error: upsertError } = await supabase
    .from("tenant_subscriptions")
    .upsert(
      {
        tenant_id: user.tenant.id,
        plan_id: payload.planId,
        status: payload.status ?? "active",
        current_period_start: startOfMonth.toISOString().slice(0, 10),
        current_period_end: endOfMonth.toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );

  if (upsertError) {
    throw upsertError;
  }

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "subscription.updated",
    entity: "tenant_subscriptions",
    changes: {
      plan_id: payload.planId,
      status: payload.status ?? "active",
    },
  });

  revalidatePath("/settings/tenant");
}


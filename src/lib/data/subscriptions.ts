import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";

function getUtcMonthBounds(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return {
    start,
    end,
  };
}

export async function listSubscriptionPlans() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("price_cents", { ascending: true });

  if (error) {
    console.error("Failed to load subscription plans", error);
    throw error;
  }

  return data ?? [];
}

export async function getTenantSubscription() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tenant_subscriptions")
    .select(
      `
        *,
        plan:subscription_plans (*)
      `,
    )
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load tenant subscription", error);
    throw error;
  }

  return data;
}

export type SubscriptionUsage = {
  promptCount: number;
  bankUploadCount: number;
  periodStart: string;
  periodEnd: string;
};

export async function getSubscriptionUsage(): Promise<SubscriptionUsage | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const { start, end } = getUtcMonthBounds();
  const periodStartIso = start.toISOString();
  const periodEndIso = end.toISOString();

  const supabase = await createServerSupabaseClient();

  const [{ count: promptCount }, { count: bankCount }] = await Promise.all([
    supabase
      .from("ai_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenant.id)
      .gte("created_at", periodStartIso)
      .lt("created_at", periodEndIso),
    supabase
      .from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenant.id)
      .gte("created_at", periodStartIso)
      .lt("created_at", periodEndIso),
  ]);

  return {
    promptCount: promptCount ?? 0,
    bankUploadCount: bankCount ?? 0,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}


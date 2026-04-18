import { redirect } from "next/navigation";
import { SettingsPageClient } from "@/components/settings/settings-page-client";
import { getCompanySettings, listUsefulLifeDefaults } from "@/lib/data/company-settings";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts, type UserRole } from "@/lib/auth";
import {
  getSubscriptionUsage,
  getTenantSubscription,
  listSubscriptionPlans,
} from "@/lib/data/subscriptions";
import { getTenantProfile } from "@/lib/data/tenant";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const canManage = canManageAccounts(user.role as UserRole);

  const [
    settings,
    usefulLife,
    tenant,
    plans,
    subscription,
    usage,
    hasTransactions,
  ] = await Promise.all([
    getCompanySettings(),
    listUsefulLifeDefaults(),
    getTenantProfile(),
    listSubscriptionPlans(),
    getTenantSubscription(),
    getSubscriptionUsage(),
    (async () => {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("tenant_id", user.tenant_id)
        .limit(1)
        .maybeSingle();
      return !!data;
    })(),
  ]);

  if (!settings) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Company settings could not be loaded.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Company-wide configuration for profile, tax, accounting, approvals, and reporting.
        </p>
      </div>
      <SettingsPageClient
        canManage={canManage}
        settings={settings}
        usefulLife={usefulLife}
        hasTransactions={hasTransactions}
        subscriptionBundle={{ plans, subscription, usage }}
        currentUser={user}
        periodClosedThrough={tenant?.accounting_period_closed_through ?? null}
      />
    </div>
  );
}

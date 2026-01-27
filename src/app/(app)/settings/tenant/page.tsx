import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantProfileForm } from "@/components/settings/tenant-profile-form";
import { UserInviteForm } from "@/components/settings/user-invite-form";
import { UserList } from "@/components/settings/user-list";
import { InvitesTable } from "@/components/settings/invites-table";
import { SubscriptionManager } from "@/components/settings/subscription-manager";
import { AccountingPoliciesForm } from "@/components/settings/accounting-policies-form";
import { TaxRatesForm } from "@/components/settings/tax-rates-form";
import { UnitsOfMeasureForm } from "@/components/settings/units-of-measure-form";
import { BaseCurrencyForm } from "@/components/settings/base-currency-form";
import { getTenantProfile, getAccountingPolicy } from "@/lib/data/tenant";
import { listTenantUsers, listPendingInvites } from "@/lib/data/tenant";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts, type UserRole } from "@/lib/auth";
import {
  getTenantSubscription,
  getSubscriptionUsage,
  listSubscriptionPlans,
} from "@/lib/data/subscriptions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const revalidate = 60;

export default async function TenantSettingsPage() {
  const [tenant, users, invites, currentUser, plans, subscription, usage, policy] = await Promise.all([
    getTenantProfile(),
    listTenantUsers(),
    listPendingInvites(),
    getCurrentUser(),
    listSubscriptionPlans(),
    getTenantSubscription(),
    getSubscriptionUsage(),
    getAccountingPolicy(),
  ]);

  const canManage = currentUser ? canManageAccounts(currentUser.role as UserRole) : false;

  // Check if inventory transactions exist
  let hasInventoryTransactions = false;
  // Check if any transactions exist (for base currency warning)
  let hasTransactions = false;
  if (currentUser?.tenant) {
    const supabase = await createServerSupabaseClient();
    // Using type assertion since table may not be in generated types yet
    const { data: invData } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("inventory_transactions" as never)
      .select("id")
      .eq("tenant_id", currentUser.tenant.id)
      .limit(1)
      .maybeSingle();
    hasInventoryTransactions = !!invData;

    // Check for any journal entries (indicates transactions exist)
    const { data: journalData } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("tenant_id", currentUser.tenant.id)
      .limit(1)
      .maybeSingle();
    hasTransactions = !!journalData;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Tenant Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage company profile, user access, and pending invitations.
        </p>
      </div>

      {canManage ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Company Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <TenantProfileForm defaultName={tenant?.name ?? ""} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Financial Settings</CardTitle>
              <CardDescription>
                Configure base currency for reporting and currency conversion defaults.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BaseCurrencyForm
                defaultBaseCurrency={((tenant as any)?.base_currency as string) || "AED"}
                hasTransactions={hasTransactions}
              />
            </CardContent>
          </Card>
        </>
      ) : null}

      <SubscriptionManager
        plans={plans}
        subscription={subscription}
        usage={usage}
        canManage={canManage}
      />

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite Users</CardTitle>
          </CardHeader>
          <CardContent>
            <UserInviteForm />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          <UserList users={users} />
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <InvitesTable invites={invites} />
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Tax Rates</CardTitle>
              <CardDescription>
                Configure tax rates once and select from dropdown when creating drafts.
                Tax amounts will be auto-calculated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TaxRatesForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Units of Measure</CardTitle>
              <CardDescription>
                Manage units for inventory items (kg, litre, cm, etc.).
                Common units are pre-configured.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UnitsOfMeasureForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accounting Policies</CardTitle>
              <CardDescription>
                Configure company-level accounting policies that apply consistently across all transactions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccountingPoliciesForm
                policy={policy}
                hasInventoryTransactions={hasInventoryTransactions}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}


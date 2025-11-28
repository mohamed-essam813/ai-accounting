import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantProfileForm } from "@/components/settings/tenant-profile-form";
import { UserInviteForm } from "@/components/settings/user-invite-form";
import { UserList } from "@/components/settings/user-list";
import { InvitesTable } from "@/components/settings/invites-table";
import { SubscriptionManager } from "@/components/settings/subscription-manager";
import { getTenantProfile } from "@/lib/data/tenant";
import { listTenantUsers, listPendingInvites } from "@/lib/data/tenant";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts } from "@/lib/auth";
import {
  getTenantSubscription,
  getSubscriptionUsage,
  listSubscriptionPlans,
} from "@/lib/data/subscriptions";

export const revalidate = 60;

export default async function TenantSettingsPage() {
  const [tenant, users, invites, currentUser, plans, subscription, usage] = await Promise.all([
    getTenantProfile(),
    listTenantUsers(),
    listPendingInvites(),
    getCurrentUser(),
    listSubscriptionPlans(),
    getTenantSubscription(),
    getSubscriptionUsage(),
  ]);

  const canManage = currentUser ? canManageAccounts(currentUser.role) : false;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Tenant Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage company profile, user access, and pending invitations.
        </p>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Company Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <TenantProfileForm defaultName={tenant?.name ?? ""} />
          </CardContent>
        </Card>
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
    </div>
  );
}


import { listAccounts } from "@/lib/data/accounts";
import { getCurrentUser } from "@/lib/data/users";
import { AccountsTabs } from "@/components/accounts/accounts-tabs";
import { AccountForm } from "@/components/accounts/account-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canManageAccounts, type UserRole } from "@/lib/auth";

export const revalidate = 60;

export default async function AccountsPage() {
  const [accounts, user] = await Promise.all([
    listAccounts(),
    getCurrentUser(),
  ]);
  const canManage = user ? canManageAccounts(user.role as UserRole) : false;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Chart of Accounts</h2>
        <p className="text-sm text-muted-foreground">
          Maintain the accounts used when posting journal entries. AI will automatically select appropriate accounts based on transaction context. Only admins can modify this list.
        </p>
      </div>
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Add New Account</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountForm />
          </CardContent>
        </Card>
      ) : null}
      <AccountsTabs accounts={accounts} canManage={canManage} />
    </div>
  );
}


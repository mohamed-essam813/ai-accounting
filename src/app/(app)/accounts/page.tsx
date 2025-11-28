import { listAccounts, listIntentAccountMappings } from "@/lib/data/accounts";
import { getCurrentUser } from "@/lib/data/users";
import { AccountsTable } from "@/components/accounts/accounts-table";
import { AccountForm } from "@/components/accounts/account-form";
import { IntentMappingTable } from "@/components/accounts/intent-mapping-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canManageAccounts } from "@/lib/auth";

export const revalidate = 60;

export default async function AccountsPage() {
  const [accounts, user, intentMappings] = await Promise.all([
    listAccounts(),
    getCurrentUser(),
    listIntentAccountMappings(),
  ]);
  const canManage = user ? canManageAccounts(user.role) : false;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Chart of Accounts</h2>
        <p className="text-sm text-muted-foreground">
          Maintain the accounts used when posting journal entries. Only admins can modify this list.
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
      <AccountsTable accounts={accounts} canManage={canManage} />
      <Card>
        <CardHeader>
          <CardTitle>Intent to Account Mapping</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Control which accounts are used when drafts are posted. Update mappings to align AI output
            with your chart of accounts, including optional tax handling.
          </p>
          <IntentMappingTable
            accounts={accounts}
            mappings={intentMappings}
            canManage={canManage}
          />
        </CardContent>
      </Card>
    </div>
  );
}


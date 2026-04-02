import { listBankTransactionsWithExistingMatches } from "@/lib/data/bank";
import { listAccounts } from "@/lib/data/accounts";
import { BankUploader } from "@/components/bank/bank-uploader";
import { BankTransactionsTable } from "@/components/bank/bank-transactions-table";
import { BankAccountSelector } from "@/components/bank/bank-account-selector";
import { filterBankReconciliationAccounts } from "@/lib/accounting/is-bank-account";
import type { Account } from "@/lib/accounting";

export const revalidate = 60;

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ bankAccountId?: string }>;
}) {
  const params = await searchParams;
  const [transactions, accounts] = await Promise.all([
    listBankTransactionsWithExistingMatches(50, params.bankAccountId),
    listAccounts(),
  ]);

  // Only BANK accounts (detail_type='bank' AND allow_reconciliation=true). Exclude Cash, Petty Cash, etc.
  // Cast accounts to include optional new fields for filtering
  const bankAccounts = filterBankReconciliationAccounts(accounts as Account[]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Bank Reconciliation</h2>
        <p className="text-sm text-muted-foreground">
          Import from PDF or CSV. If you already recorded a payment or receipt in Record Activity, we suggest matching
          the bank line to that entry first so nothing is posted twice. Otherwise, use Resolve to categorize the line.
        </p>
      </div>
      {bankAccounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            No bank accounts found.
          </p>
          <p className="text-xs text-muted-foreground">
            Create one in Chart of Accounts with Type = Asset, Subtype = Bank to enable reconciliation.
          </p>
        </div>
      ) : (
        <>
          <BankAccountSelector accounts={bankAccounts} selectedAccountId={params.bankAccountId} />
          <BankUploader bankAccountId={params.bankAccountId} accounts={bankAccounts} />
          <BankTransactionsTable
            transactions={transactions}
            accounts={accounts.map((a) => ({
              id: a.id,
              name: a.name,
              code: a.code,
              type: a.type,
            }))}
          />
        </>
      )}
    </div>
  );
}


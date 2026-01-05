import { listBankTransactions } from "@/lib/data/bank";
import { listAccounts } from "@/lib/data/accounts";
import { BankUploader } from "@/components/bank/bank-uploader";
import { BankTransactionsTable } from "@/components/bank/bank-transactions-table";
import { BankAccountSelector } from "@/components/bank/bank-account-selector";
import { filterBankAccounts } from "@/lib/accounting/is-bank-account";

export const revalidate = 60;

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ bankAccountId?: string }>;
}) {
  const params = await searchParams;
  const [transactions, accounts] = await Promise.all([
    listBankTransactions(50, params.bankAccountId),
    listAccounts(),
  ]);

  // Filter to only Cash/Bank accounts (codes 1000-1099)
  // This is a strict accounting requirement: bank reconciliation must only work with Cash/Bank accounts
  const bankAccounts = filterBankAccounts(accounts);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Bank Reconciliation</h2>
        <p className="text-sm text-muted-foreground">
          Import CSV statements, classify transactions, and match them to posted journal entries.
        </p>
      </div>
      <BankAccountSelector accounts={bankAccounts} selectedAccountId={params.bankAccountId} />
      <BankUploader bankAccountId={params.bankAccountId} accounts={bankAccounts} />
      <BankTransactionsTable transactions={transactions} />
    </div>
  );
}


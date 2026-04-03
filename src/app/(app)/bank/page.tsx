import { listBankTransactionsWithExistingMatches } from "@/lib/data/bank";
import { listAccounts } from "@/lib/data/accounts";
import { getBankReconciliationSummary } from "@/lib/data/bank-reconciliation-summary";
import { BankUploader } from "@/components/bank/bank-uploader";
import { BankTransactionsTable } from "@/components/bank/bank-transactions-table";
import { BankAccountSelector } from "@/components/bank/bank-account-selector";
import { BankReconciliationSummary } from "@/components/bank/bank-reconciliation-summary";
import { filterBankReconciliationAccounts } from "@/lib/accounting/is-bank-account";
import type { Account } from "@/lib/accounting";

export const revalidate = 60;

function parseBalanceParam(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{
    bankAccountId?: string;
    statementOpening?: string;
    statementClosing?: string;
  }>;
}) {
  const params = await searchParams;
  const bankAccountId = params.bankAccountId;

  const [transactions, accounts, summary] = await Promise.all([
    bankAccountId
      ? listBankTransactionsWithExistingMatches(200, bankAccountId)
      : Promise.resolve([]),
    listAccounts(),
    bankAccountId ? getBankReconciliationSummary(bankAccountId) : Promise.resolve(null),
  ]);

  const bankAccounts = filterBankReconciliationAccounts(accounts as Account[]);

  const statementOpening = parseBalanceParam(params.statementOpening);
  const statementClosing = parseBalanceParam(params.statementClosing);

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
          <BankAccountSelector accounts={bankAccounts} selectedAccountId={bankAccountId} />
          {bankAccountId && summary ? (
            <BankReconciliationSummary
              summary={summary}
              statementOpening={statementOpening}
              statementClosing={statementClosing}
            />
          ) : null}
          <BankUploader bankAccountId={bankAccountId} accounts={bankAccounts} />
          <BankTransactionsTable
            transactions={transactions}
            bankAccountSelected={Boolean(bankAccountId)}
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

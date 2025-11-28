import { listBankTransactions } from "@/lib/data/bank";
import { BankUploader } from "@/components/bank/bank-uploader";
import { BankTransactionsTable } from "@/components/bank/bank-transactions-table";

export const revalidate = 60;

export default async function BankPage() {
  const transactions = await listBankTransactions();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Bank Reconciliation</h2>
        <p className="text-sm text-muted-foreground">
          Import CSV statements, classify transactions, and match them to posted journal entries.
        </p>
      </div>
      <BankUploader />
      <BankTransactionsTable transactions={transactions} />
    </div>
  );
}


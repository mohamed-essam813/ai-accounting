"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { importBankTransactionsAction } from "@/lib/actions/bank";
import { toast } from "sonner";

type ParsedTransaction = {
  date: string;
  description: string;
  amount: number;
  counterparty?: string | null;
};

export function BankUploader() {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFile = (file: File) => {
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const parsed = rows
          .map((row) => {
            const amount = parseFloat(row.Amount ?? row.amount ?? row.Debit ?? "0");
            const description = row.Description ?? row.description ?? "";
            const date = row.Date ?? row.date ?? "";
            return {
              date,
              description,
              amount,
              counterparty: row.Counterparty ?? row.counterparty ?? null,
            };
          })
          .filter((txn) => txn.description && !Number.isNaN(txn.amount));
        setTransactions(parsed);
        toast.success("Bank file parsed", { description: `${parsed.length} transactions detected.` });
      },
      error: (error) => {
        console.error(error);
        toast.error("Failed to parse CSV", { description: error.message });
      },
    });
  };

  const handleImport = () => {
    if (transactions.length === 0) {
      toast.error("No transactions ready for import.");
      return;
    }
    startTransition(async () => {
      try {
        await importBankTransactionsAction({
          transactions: transactions.map((txn) => ({
            ...txn,
            sourceFile: fileName ?? undefined,
          })),
        });
        toast.success("Transactions imported");
        setTransactions([]);
        setFileName(null);
      } catch (error) {
        console.error(error);
        toast.error("Failed to import bank transactions", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Bank CSV</CardTitle>
        <CardDescription>
          Accepts UTF-8 CSV exports with columns Date, Description, Amount, Counterparty (optional).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              handleFile(file);
            }
          }}
        />
        {fileName ? (
          <div className="rounded-md border bg-muted p-3 text-sm">
            <p className="font-medium">{fileName}</p>
            <p className="text-muted-foreground">{transactions.length} rows ready for import.</p>
          </div>
        ) : null}
        <Button disabled={isPending || transactions.length === 0} onClick={handleImport}>
          {isPending ? "Importing..." : "Import Transactions"}
        </Button>
      </CardContent>
    </Card>
  );
}


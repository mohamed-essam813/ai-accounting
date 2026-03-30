"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { importBankTransactionsAction } from "@/lib/actions/bank";
import { toast } from "sonner";
import { FileSpreadsheet, FileUp } from "lucide-react";
import {
  parseBankStatementCsv,
  type ParsedBankTransaction,
} from "@/lib/bank/parse-csv-statements";

type Account = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  bankAccountId?: string;
  accounts?: Account[];
};

export function BankUploader({
  bankAccountId: initialBankAccountId,
  accounts = [],
}: Props) {
  const [transactions, setTransactions] = useState<ParsedBankTransaction[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(
    initialBankAccountId ?? ""
  );
  const [isPending, startTransition] = useTransition();
  const [isParsing, setIsParsing] = useState(false);

  const handleFile = async (file: File) => {
    setIsParsing(true);
    setFileName(file.name);
    setTransactions([]);

    try {
      const formData = new FormData();
      formData.set("file", file);

      const res = await fetch("/api/bank/parse-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? "Failed to parse PDF", {
          description: data.details,
        });
        setFileName(null);
        return;
      }

      const list = Array.isArray(data.transactions) ? data.transactions : [];
      setTransactions(list);
      toast.success("PDF parsed", {
        description: `${list.length} transaction${list.length !== 1 ? "s" : ""} detected.`,
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to parse PDF", {
        description: err instanceof Error ? err.message : undefined,
      });
      setFileName(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleCsvFile = async (file: File) => {
    setIsParsing(true);
    setFileName(file.name);
    setTransactions([]);

    try {
      const text = await file.text();
      const list = parseBankStatementCsv(text);
      setTransactions(list);
      if (list.length === 0) {
        toast.error("No transactions found in CSV", {
          description:
            "Expected columns similar to Date, Description, Amount (or Debit/Credit). Try exporting from your bank as CSV.",
        });
      } else {
        toast.success("CSV parsed", {
          description: `${list.length} transaction${list.length !== 1 ? "s" : ""} detected.`,
        });
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to parse CSV", {
        description: err instanceof Error ? err.message : undefined,
      });
      setFileName(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = () => {
    if (transactions.length === 0) {
      toast.error("No transactions ready for import.");
      return;
    }
    if (!selectedBankAccountId && accounts.length > 0) {
      toast.error("Please select a bank account before importing.");
      return;
    }
    startTransition(async () => {
      try {
        await importBankTransactionsAction({
          transactions: transactions.map((txn) => ({
            ...txn,
            sourceFile: fileName ?? undefined,
          })),
          bankAccountId: selectedBankAccountId || undefined,
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
        <CardTitle>Import bank transactions</CardTitle>
        <CardDescription>
          Upload a PDF (parsed server-side) or a CSV export (BRD). Same import flow for both.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Select bank account to reconcile *
            </label>
            <Select
              value={selectedBankAccountId}
              onValueChange={setSelectedBankAccountId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select bank account to reconcile" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only bank accounts with external statements can be reconciled.
              Transactions will be imported for the selected account.
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
          <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-6 cursor-pointer hover:bg-muted/50 transition-colors">
            <FileUp className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              {isParsing ? "Parsing…" : "Choose PDF"}
            </span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="sr-only"
              disabled={isParsing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-6 cursor-pointer hover:bg-muted/50 transition-colors">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              {isParsing ? "Parsing…" : "Choose CSV"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={isParsing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCsvFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {fileName ? (
          <div className="rounded-md border bg-muted p-3 text-sm">
            <p className="font-medium">{fileName}</p>
            <p className="text-muted-foreground">
              {transactions.length} row
              {transactions.length !== 1 ? "s" : ""} ready for import.
            </p>
          </div>
        ) : null}

        <Button
          disabled={
            isPending || isParsing || transactions.length === 0
          }
          onClick={handleImport}
        >
          {isPending ? "Importing…" : "Import transactions"}
        </Button>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  bankAccountId,
  accounts = [],
}: Props) {
  const [transactions, setTransactions] = useState<ParsedBankTransaction[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isParsing, setIsParsing] = useState(false);

  const selectedAccount = accounts.find((a) => a.id === bankAccountId);
  const importDisabled = !bankAccountId;

  useEffect(() => {
    setTransactions([]);
    setFileName(null);
  }, [bankAccountId]);

  const handleFile = async (file: File) => {
    if (importDisabled) return;
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
    if (importDisabled) return;
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
    if (importDisabled) {
      toast.error("Select a bank account above before importing.");
      return;
    }
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
          bankAccountId,
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

  const controlsDisabled = importDisabled || isParsing;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import bank transactions</CardTitle>
        <CardDescription>
          Upload a PDF (parsed server-side) or a CSV export (BRD). Same import flow for both.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {importDisabled ? (
          <p className="text-sm text-muted-foreground rounded-md border border-dashed bg-muted/30 px-3 py-2">
            Select a bank account above to import and reconcile transactions.
          </p>
        ) : selectedAccount ? (
          <p className="text-sm font-medium">
            Importing into:{" "}
            <span className="text-muted-foreground font-normal">
              {selectedAccount.code} — {selectedAccount.name}
            </span>
          </p>
        ) : (
          <p className="text-sm text-destructive">
            Selected bank account is not in the list. Pick a valid account above.
          </p>
        )}

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
          <label
            className={`flex items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-6 transition-colors ${
              controlsDisabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-muted/50"
            }`}
          >
            <FileUp className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              {isParsing ? "Parsing…" : "Choose PDF"}
            </span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="sr-only"
              disabled={controlsDisabled}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <label
            className={`flex items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-6 transition-colors ${
              controlsDisabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-muted/50"
            }`}
          >
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              {isParsing ? "Parsing…" : "Choose CSV"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={controlsDisabled}
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
            importDisabled || isPending || isParsing || transactions.length === 0
          }
          onClick={handleImport}
        >
          {isPending ? "Importing…" : "Import transactions"}
        </Button>
      </CardContent>
    </Card>
  );
}

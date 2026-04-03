"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { getSmartSuggestion } from "@/lib/bank/reconcile-smart-suggest";
import { ResolveBankTransactionDialog, type BankTxn } from "./resolve-bank-transaction-dialog";

type AccountOption = { id: string; name: string; code: string; type: string };

type Props = {
  transactions: BankTxn[];
  accounts: AccountOption[];
  /** When false and the list is empty, prompt to pick a bank first instead of “no imports”. */
  bankAccountSelected?: boolean;
};

function statusLabel(status: string, matchedEntryId?: string | null): string {
  if (status === "matched" && matchedEntryId) return "Resolved";
  if (status === "matched") return "Resolved";
  if (status === "excluded") return "Excluded";
  return "Needs review";
}

export function BankTransactionsTable({
  transactions,
  accounts,
  bankAccountSelected = true,
}: Props) {
  const [resolveTxn, setResolveTxn] = useState<BankTxn | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, startTransition] = useTransition();

  const openResolve = (transaction: BankTxn) => {
    startTransition(() => {
      setResolveTxn(transaction);
      setDialogOpen(true);
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Counterparty</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[280px] text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-sm">
                {!bankAccountSelected
                  ? "Select a bank account above to view and reconcile imported lines."
                  : "No bank transactions imported yet."}
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((transaction) => {
              const suggestion = getSmartSuggestion(transaction.description, transaction.amount);
              const isResolved = transaction.status === "matched" && transaction.matched_entry_id;
              return (
                <TableRow key={transaction.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(transaction.date)}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="truncate font-medium">{transaction.description}</div>
                    {transaction.status === "unmatched" && transaction.existingMatch ? (
                      <p className="mt-1 text-xs font-medium text-primary">{transaction.existingMatch.label}</p>
                    ) : transaction.status === "unmatched" ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Suggested: {suggestion.inlineLabel}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>{transaction.counterparty ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(transaction.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        transaction.status === "matched"
                          ? "secondary"
                          : transaction.status === "excluded"
                            ? "outline"
                            : "default"
                      }
                    >
                      {statusLabel(transaction.status, transaction.matched_entry_id)}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-y-2 text-right">
                    {isResolved && transaction.matched_entry_id ? (
                      <Button variant="link" className="h-auto p-0 text-sm" asChild>
                        <Link href={`/journals?entryId=${transaction.matched_entry_id}`}>
                          View recording
                        </Link>
                      </Button>
                    ) : transaction.status === "unmatched" ? (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => openResolve(transaction)}
                      >
                        Resolve
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <ResolveBankTransactionDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setResolveTxn(null);
        }}
        transaction={resolveTxn}
        accounts={accounts}
      />
    </div>
  );
}

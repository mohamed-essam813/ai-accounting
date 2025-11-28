"use client";

import { useState, useTransition } from "react";
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
import { matchBankTransactionAction } from "@/lib/actions/bank";
import { toast } from "sonner";

type BankTransaction = {
  id: string;
  date: string;
  amount: number;
  description: string;
  counterparty?: string | null;
  status: "unmatched" | "matched" | "excluded";
  matched_entry_id?: string | null;
};

type Suggestion = {
  id: string;
  description: string;
  posted_at: string | null;
};

type Props = {
  transactions: BankTransaction[];
};

export function BankTransactionsTable({ transactions }: Props) {
  const [matchState, setMatchState] = useState<Record<string, Suggestion[]>>({});
  const [isPending, startTransition] = useTransition();

  const fetchSuggestions = async (transaction: BankTransaction) => {
    try {
      const response = await fetch("/api/bank/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: transaction.amount,
          description: transaction.description,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to fetch suggestions");
      }
      setMatchState((prev) => ({
        ...prev,
        [transaction.id]: data.matches,
      }));
    } catch (error) {
      console.error(error);
      toast.error("Suggestion lookup failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleMatch = (transactionId: string, entryId: string) => {
    startTransition(async () => {
      try {
        await matchBankTransactionAction({ transactionId, entryId });
        toast.success("Transaction reconciled");
      } catch (error) {
        console.error(error);
        toast.error("Failed to reconcile transaction", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
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
            <TableHead className="w-64 text-right">Reconciliation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-sm">
                No bank transactions imported yet.
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((transaction) => {
              const suggestions = matchState[transaction.id] ?? [];
              return (
                <TableRow key={transaction.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(transaction.date)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{transaction.description}</TableCell>
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
                      {transaction.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-y-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => fetchSuggestions(transaction)}
                    >
                      Suggest matches
                    </Button>
                    {suggestions.length > 0 ? (
                      <div className="text-left text-xs">
                        <p className="mb-1 font-medium text-muted-foreground">Suggestions:</p>
                        <ul className="space-y-1">
                          {suggestions.map((match) => (
                            <li key={match.id} className="flex items-center justify-between gap-2">
                              <div>
                                <p className="truncate font-medium">{match.description}</p>
                                <p className="text-[10px] uppercase text-muted-foreground">
                                  {match.posted_at ? formatDate(match.posted_at) : "Unposted"}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleMatch(transaction.id, match.id)}
                                disabled={isPending}
                              >
                                Match
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {transaction.matched_entry_id ? (
                      <p className="text-xs text-muted-foreground">
                        Matched to entry {transaction.matched_entry_id.slice(0, 8)}…
                      </p>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}


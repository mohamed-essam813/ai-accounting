"use client";

import { useEffect, useState } from "react";
import { getContactStatementAction } from "@/lib/actions/contacts";
import type { StatementTransaction } from "@/lib/data/contacts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { Database } from "@/lib/database.types";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];

type Props = {
  contact: Contact;
};

export function StatementOfAccount({ contact }: Props) {
  const [transactions, setTransactions] = useState<StatementTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getContactStatementAction(contact.id)
      .then((data) => {
        if (!cancelled) {
          setTransactions(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load statement");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [contact.id]);

  const handleExport = () => {
    // Create CSV content
    const headers = ["Date", "Description", "Debit", "Credit", "Balance"];
    const rows = transactions.map((t) => [
      t.date,
      t.description,
      t.debit.toFixed(2),
      t.credit.toFixed(2),
      t.balance.toFixed(2),
    ]);
    
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Statement_${contact.code}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Statement of Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Statement of Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const currentBalance = transactions.length > 0 
    ? transactions[transactions.length - 1].balance 
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Statement of Account</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {contact.name} ({contact.code})
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No transactions found for this contact.
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm">
                        {formatDate(transaction.date)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="text-sm">{transaction.description}</div>
                          {transaction.document_number && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {transaction.document_number}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {transaction.debit > 0 ? formatCurrency(transaction.debit) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {transaction.credit > 0 ? formatCurrency(transaction.credit) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatCurrency(transaction.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted font-semibold">
                    <TableCell colSpan={4} className="text-right">
                      Current Balance
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(currentBalance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

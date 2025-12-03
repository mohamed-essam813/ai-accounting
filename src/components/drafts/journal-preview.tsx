"use client";

import { useEffect, useState } from "react";
import { getDraftJournalPreview } from "@/lib/actions/drafts";
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

type Props = {
  draftId: string;
};

export function JournalPreview({ draftId }: Props) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof getDraftJournalPreview>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getDraftJournalPreview(draftId)
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load preview");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draftId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Journal Entry Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Journal Entry Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error ?? "Failed to load preview"}</p>
        </CardContent>
      </Card>
    );
  }

  const totalDebit = preview.journalLines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = preview.journalLines.reduce((sum, line) => sum + line.credit, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal Entry Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="text-sm font-medium">{formatDate(preview.entities.date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {preview.intent === "create_invoice" ? "Invoice Number" : preview.intent === "create_bill" ? "Bill Number" : "Document"}
            </p>
            <p className="text-sm font-medium font-mono">
              {preview.entities.invoice_number ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Counterparty</p>
            <p className="text-sm font-medium">{preview.entities.counterparty ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="text-sm font-medium">
              {formatCurrency(preview.entities.amount, preview.entities.currency)}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Description</p>
          <p className="text-sm">{preview.description}</p>
        </div>

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Memo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.journalLines.map((line, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-xs">{line.account_code}</TableCell>
                  <TableCell>{line.account_name}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {line.debit > 0 ? formatCurrency(line.debit, preview.entities.currency) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {line.credit > 0 ? formatCurrency(line.credit, preview.entities.currency) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{line.memo ?? "—"}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted font-semibold">
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(totalDebit, preview.entities.currency)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(totalCredit, preview.entities.currency)}
                </TableCell>
                <TableCell>
                  {Math.abs(totalDebit - totalCredit) < 0.01 ? (
                    <span className="text-green-600 text-xs">✓ Balanced</span>
                  ) : (
                    <span className="text-destructive text-xs">Unbalanced</span>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}


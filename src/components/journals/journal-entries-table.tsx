"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatCurrency } from "@/lib/format";
import type { JournalEntryWithLines } from "@/lib/data/journals";

type Props = {
  entries: JournalEntryWithLines[];
  accounts: Array<{ id: string; code: string; name: string }>;
};

export function JournalEntriesTable({ entries, accounts }: Props) {
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Recent Journal Entries</h3>
        <p className="text-sm text-muted-foreground">
          Manual journal entries posted to the ledger.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  No journal entries yet. Create one above to get started.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => {
                const totalDebit = entry.journal_lines.reduce((sum, line) => sum + Number(line.debit), 0);
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm">{formatDate(entry.date)}</TableCell>
                    <TableCell className="max-w-md">{entry.description}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {entry.journal_lines.map((line, idx) => (
                          <div key={idx} className="text-xs text-muted-foreground">
                            {line.account_code} {line.account_name}:{" "}
                            {Number(line.debit) > 0 ? (
                              <span className="text-green-600">DR {formatCurrency(Number(line.debit), "AED")}</span>
                            ) : (
                              <span className="text-blue-600">CR {formatCurrency(Number(line.credit), "AED")}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(totalDebit, "AED")}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}


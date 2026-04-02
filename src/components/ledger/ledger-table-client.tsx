"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

type LedgerEntry = {
  uniqueKey: string;
  entry_id: string;
  date: string;
  description: string;
  account_name: string;
  account_code: string;
  debit: number | null;
  credit: number | null;
  runningBalance: number;
  memo: string | null;
};

type Props = {
  entries: LedgerEntry[];
  displayCurrency?: string; // Currency to display amounts in
};

export function LedgerTableClient({ entries, displayCurrency }: Props) {
  const {
    currentItems: paginatedEntries,
    currentPage,
    totalPages,
    goToPage,
    itemsPerPage,
    setItemsPerPage,
  } = usePagination({ data: entries, itemsPerPage: 50 });

  if (entries.length === 0) {
    return (
      <div className="flex min-h-[10rem] flex-1 items-center justify-center px-6 py-8">
        <p className="text-sm text-muted-foreground text-center">
          No transactions found for the selected criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="ledger-scroll min-h-0 flex-1 overflow-y-auto overflow-x-auto">
        <Table className="w-full min-w-[900px]">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="bg-card">Date</TableHead>
              <TableHead className="bg-card">Description</TableHead>
              <TableHead className="bg-card">Account</TableHead>
              <TableHead className="text-right bg-card">Debit</TableHead>
              <TableHead className="text-right bg-card">Credit</TableHead>
              <TableHead className="text-right bg-card">Balance</TableHead>
              <TableHead className="bg-card">Memo</TableHead>
              <TableHead className="w-[100px] bg-card">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedEntries.map((entry) => (
              <TableRow key={entry.uniqueKey}>
                <TableCell className="font-mono text-sm">
                  {formatDate(entry.date)}
                </TableCell>
                <TableCell>{entry.description}</TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{entry.account_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {entry.account_code}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {Number(entry.debit) > 0 
                    ? formatCurrency(Number(entry.debit), displayCurrency)
                    : "-"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {Number(entry.credit) > 0 
                    ? formatCurrency(Number(entry.credit), displayCurrency)
                    : "-"}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatCurrency(entry.runningBalance, displayCurrency)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {entry.memo || "-"}
                </TableCell>
                <TableCell>
                  <Link href={`/journals?entryId=${entry.entry_id}`}>
                    <Button variant="ghost" size="sm" className="h-8">
                      View
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {entries.length > 0 && (
        <div className="shrink-0 border-t bg-card px-4 py-3">
          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={entries.length}
            itemsPerPage={itemsPerPage}
            onPageChange={goToPage}
            onItemsPerPageChange={setItemsPerPage}
          />
        </div>
      )}
    </div>
  );
}

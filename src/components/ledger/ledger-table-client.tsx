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
      <p className="text-sm text-muted-foreground text-center py-8">
        No transactions found for the selected criteria.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
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
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={entries.length}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      )}
    </>
  );
}

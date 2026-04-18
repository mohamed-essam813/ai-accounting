"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { formatCoaAccountLabel } from "@/lib/drafts/account-display";

export type LedgerEntrySingle = {
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

export type LedgerEntryAllAccounts = Omit<LedgerEntrySingle, "runningBalance"> & {
  debitRunningTotal: number;
  creditRunningTotal: number;
};

export type LedgerTableRow = LedgerEntrySingle | LedgerEntryAllAccounts;

type Props =
  | { variant: "single-account"; entries: LedgerEntrySingle[]; displayCurrency?: string }
  | { variant: "all-accounts"; entries: LedgerEntryAllAccounts[]; displayCurrency?: string };

export function LedgerTableClient(props: Props) {
  const { variant, displayCurrency, entries } = props;
  const {
    currentItems: paginatedEntries,
    currentPage,
    totalPages,
    goToPage,
    itemsPerPage,
    setItemsPerPage,
  } = usePagination<LedgerTableRow>({ data: entries, itemsPerPage: 50 });

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
              {variant === "single-account" ? (
                <TableHead className="text-right bg-card">Balance</TableHead>
              ) : (
                <>
                  <TableHead className="text-right bg-card">Debit total</TableHead>
                  <TableHead className="text-right bg-card">Credit total</TableHead>
                </>
              )}
              <TableHead className="bg-card">Memo</TableHead>
              <TableHead className="w-[100px] bg-card">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variant === "single-account"
              ? paginatedEntries.map((entry) => {
                  const row = entry as LedgerEntrySingle;
                  return (
                  <TableRow key={row.uniqueKey}>
                    <TableCell className="font-mono text-sm">
                      {formatDate(row.date)}
                    </TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatCoaAccountLabel(row.account_code, row.account_name)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(row.debit) > 0
                        ? formatCurrency(Number(row.debit), displayCurrency)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(row.credit) > 0
                        ? formatCurrency(Number(row.credit), displayCurrency)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(row.runningBalance, displayCurrency)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.memo || "-"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/journals?entryId=${row.entry_id}`}>
                        <Button variant="ghost" size="sm" className="h-8">
                          View
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                  );
                })
              : paginatedEntries.map((entry) => {
                  const row = entry as LedgerEntryAllAccounts;
                  return (
                  <TableRow key={row.uniqueKey}>
                    <TableCell className="font-mono text-sm">
                      {formatDate(row.date)}
                    </TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatCoaAccountLabel(row.account_code, row.account_name)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(row.debit) > 0
                        ? formatCurrency(Number(row.debit), displayCurrency)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(row.credit) > 0
                        ? formatCurrency(Number(row.credit), displayCurrency)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(row.debitRunningTotal, displayCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(row.creditRunningTotal, displayCurrency)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.memo || "-"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/journals?entryId=${row.entry_id}`}>
                        <Button variant="ghost" size="sm" className="h-8">
                          View
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                  );
                })}
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

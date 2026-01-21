/**
 * Grouped Journal Ledger Table with Pivot-Table Features
 * Excel Elimination Doctrine: Pivot-Table-Level Reporting
 * 
 * Features:
 * - Grouping by account
 * - Expand/collapse by account
 * - Subtotals per account
 * - Drill-down to individual transactions
 */

"use client";

import { useState, Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";

type JournalLedgerRow = {
  tenant_id: string;
  entry_id: string;
  date: string;
  description: string;
  status: string;
  created_at: string;
  account_code: string;
  account_name: string;
  debit: number | null;
  credit: number | null;
  memo: string | null;
};

interface Props {
  data: JournalLedgerRow[];
}

interface GroupedAccount {
  accountCode: string;
  accountName: string;
  entries: JournalLedgerRow[];
  totalDebit: number;
  totalCredit: number;
  balance: number;
  expanded: boolean;
}

export function GroupedLedgerTable({ data }: Props) {
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // Group entries by account
  const grouped = data.reduce((acc, entry) => {
    const key = entry.account_code;
    if (!acc[key]) {
      acc[key] = {
        accountCode: entry.account_code,
        accountName: entry.account_name,
        entries: [],
        totalDebit: 0,
        totalCredit: 0,
        balance: 0,
        expanded: expandedAccounts.has(key),
      };
    }
    acc[key].entries.push(entry);
    acc[key].totalDebit += Number(entry.debit ?? 0);
    acc[key].totalCredit += Number(entry.credit ?? 0);
    return acc;
  }, {} as Record<string, GroupedAccount>);

  // Calculate balances
  Object.values(grouped).forEach((group) => {
    group.balance = group.totalDebit - group.totalCredit;
  });

  const groups = Object.values(grouped).sort((a, b) =>
    a.accountCode.localeCompare(b.accountCode),
  );

  const toggleAccount = (accountCode: string) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountCode)) {
      newExpanded.delete(accountCode);
    } else {
      newExpanded.add(accountCode);
    }
    setExpandedAccounts(newExpanded);
  };

  // Calculate grand totals
  const grandTotalDebit = data.reduce((sum, entry) => sum + Number(entry.debit ?? 0), 0);
  const grandTotalCredit = data.reduce((sum, entry) => sum + Number(entry.credit ?? 0), 0);

  return (
    <div className="overflow-x-auto p-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead>
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
          {groups.map((group) => {
            const isExpanded = expandedAccounts.has(group.accountCode);

            return (
              <Fragment key={group.accountCode}>
                {/* Account Group Header */}
                <TableRow className="bg-muted/50 font-semibold hover:bg-muted/70">
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => toggleAccount(group.accountCode)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">{group.accountName}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {group.totalDebit > 0 ? formatCurrency(group.totalDebit) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {group.totalCredit > 0 ? formatCurrency(group.totalCredit) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    <Link
                      href={`/ledger?accountCode=${group.accountCode}`}
                      className="hover:text-primary hover:underline decoration-dotted"
                      title="View all transactions for this account"
                    >
                      {formatCurrency(group.balance)}
                    </Link>
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell>
                    <Link href={`/ledger?accountCode=${group.accountCode}`}>
                      <Button variant="ghost" size="sm" className="h-7 text-xs">
                        View All
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>

                {/* Account Entries (when expanded) */}
                {isExpanded &&
                  group.entries.map((entry, idx) => {
                    const entryBalance = Number(entry.debit ?? 0) - Number(entry.credit ?? 0);
                    return (
                      <TableRow key={`${entry.entry_id}-${idx}`} className="hover:bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell className="text-sm font-mono">
                          {formatDate(entry.date)}
                        </TableCell>
                        <TableCell className="max-w-md pl-6">{entry.description}</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {Number(entry.debit ?? 0) > 0
                            ? formatCurrency(Number(entry.debit))
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {Number(entry.credit ?? 0) > 0
                            ? formatCurrency(Number(entry.credit))
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(entryBalance)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {entry.memo ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Link href={`/journals?entryId=${entry.entry_id}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </Fragment>
            );
          })}

          {/* Grand Total Row */}
          <TableRow className="bg-primary/5 font-bold border-t-2">
            <TableCell colSpan={4} className="font-semibold">
              Grand Total
            </TableCell>
            <TableCell className="text-right font-mono font-semibold">
              {formatCurrency(grandTotalDebit)}
            </TableCell>
            <TableCell className="text-right font-mono font-semibold">
              {formatCurrency(grandTotalCredit)}
            </TableCell>
            <TableCell className="text-right font-mono font-semibold">
              {formatCurrency(grandTotalDebit - grandTotalCredit)}
            </TableCell>
            <TableCell colSpan={2}></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}


/**
 * Trial Balance Table with Pivot-Table Features
 * Excel Elimination Doctrine: Pivot-Table-Level Reporting
 * 
 * Features:
 * - Grouping by account type
 * - Expand/collapse rows
 * - Subtotals
 * - Drill-down to ledger
 */

"use client";

import { useState, Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";
import type { Database } from "@/lib/database.types";

type TrialBalanceRow = Database["public"]["Views"]["v_trial_balance"]["Row"];

interface Props {
  data: TrialBalanceRow[];
}

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

interface GroupedAccount {
  type: AccountType;
  accounts: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  expanded: boolean;
}

export function TrialBalanceTable({ data }: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<AccountType>>(
    new Set(["asset", "liability"]), // Default: expand assets and liabilities
  );

  // Group accounts by type
  const grouped = data.reduce((acc, account) => {
    const type = (account.type || "other") as AccountType;
    if (!acc[type]) {
      acc[type] = {
        type,
        accounts: [],
        totalDebit: 0,
        totalCredit: 0,
        expanded: expandedGroups.has(type),
      };
    }
    acc[type].accounts.push(account);
    acc[type].totalDebit += Number(account.total_debit ?? 0);
    acc[type].totalCredit += Number(account.total_credit ?? 0);
    return acc;
  }, {} as Record<AccountType, GroupedAccount>);

  const groups = Object.values(grouped).sort((a, b) => {
    const order: Record<AccountType, number> = {
      asset: 1,
      liability: 2,
      equity: 3,
      revenue: 4,
      expense: 5,
    };
    return (order[a.type] || 99) - (order[b.type] || 99);
  });

  const toggleGroup = (type: AccountType) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedGroups(newExpanded);
  };

  // Calculate grand totals
  const grandTotalDebit = data.reduce((sum, acc) => sum + Number(acc.total_debit ?? 0), 0);
  const grandTotalCredit = data.reduce((sum, acc) => sum + Number(acc.total_credit ?? 0), 0);

  return (
    <div className="overflow-x-auto p-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead>
            <TableHead>Account Code</TableHead>
            <TableHead>Account Name</TableHead>
            <TableHead className="text-right">Debit</TableHead>
            <TableHead className="text-right">Credit</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const isExpanded = expandedGroups.has(group.type);
            const groupBalance =
              group.type === "asset" || group.type === "expense"
                ? group.totalDebit - group.totalCredit
                : group.totalCredit - group.totalDebit;

            return (
              <Fragment key={group.type}>
                {/* Group Header Row */}
                <TableRow className="bg-muted/50 font-semibold hover:bg-muted/70">
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => toggleGroup(group.type)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {getTypeCode(group.type)}
                  </TableCell>
                  <TableCell className="capitalize pl-6">
                    {group.type === "asset" ? "Assets" : group.type === "liability" ? "Liabilities" : group.type === "equity" ? "Equity" : group.type === "revenue" ? "Revenue" : "Expenses"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(group.totalDebit)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(group.totalCredit)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(groupBalance)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>

                {/* Group Accounts (when expanded) */}
                {isExpanded &&
                  group.accounts.map((account) => {
                    const balance =
                      group.type === "asset" || group.type === "expense"
                        ? Number(account.total_debit ?? 0) - Number(account.total_credit ?? 0)
                        : Number(account.total_credit ?? 0) - Number(account.total_debit ?? 0);

                    return (
                      <TableRow key={account.account_id} className="hover:bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell className="font-mono text-xs">
                          {account.code}
                        </TableCell>
                        <TableCell className="pl-6">{account.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {Number(account.total_debit ?? 0) > 0
                            ? formatCurrency(Number(account.total_debit))
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {Number(account.total_credit ?? 0) > 0
                            ? formatCurrency(Number(account.total_credit))
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <Link
                            href={`/ledger?accountCode=${account.code}`}
                            className="hover:text-primary hover:underline decoration-dotted"
                            title="View ledger transactions"
                          >
                            {formatCurrency(balance)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/ledger?accountCode=${account.code}`}>
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
            <TableCell colSpan={3} className="font-semibold">
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
            <TableCell></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function getTypeCode(type: AccountType): string {
  const codes: Record<AccountType, string> = {
    asset: "1xxx",
    liability: "2xxx",
    equity: "3xxx",
    revenue: "4xxx",
    expense: "5xxx",
  };
  return codes[type] || "—";
}


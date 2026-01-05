"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";
import type { BalanceSheetLineItem } from "@/lib/data/reports-detailed";

type Props = {
  data: {
    currentAssets: BalanceSheetLineItem[];
    nonCurrentAssets: BalanceSheetLineItem[];
    currentLiabilities: BalanceSheetLineItem[];
    nonCurrentLiabilities: BalanceSheetLineItem[];
    equity: BalanceSheetLineItem[];
    totals: {
      totalCurrentAssets: number;
      totalNonCurrentAssets: number;
      totalAssets: number;
      totalCurrentLiabilities: number;
      totalNonCurrentLiabilities: number;
      totalLiabilities: number;
      totalEquity: number;
      totalLiabilitiesAndEquity: number;
    };
  };
  startDate?: string;
  endDate?: string;
};

export function BalanceSheetTable({ data, startDate, endDate }: Props) {
  const {
    currentAssets,
    nonCurrentAssets,
    currentLiabilities,
    nonCurrentLiabilities,
    equity,
    totals,
  } = data;

  const renderSection = (
    title: string,
    items: BalanceSheetLineItem[],
    showSubtotal: boolean,
    subtotal: number
  ) => {
    // Don't show section if no items and subtotal is zero
    if (items.length === 0 && (!showSubtotal || subtotal === 0)) return null;

    return (
      <>
        {items.length > 0 && (
          <>
            <TableRow className="bg-muted/50">
              <TableHead colSpan={3} className="font-semibold">
                {title}
              </TableHead>
            </TableRow>
            {items.map((item) => (
              <TableRow key={item.account_code} className="hover:bg-muted/30">
                <TableCell className="pl-8 text-muted-foreground">
                  {item.account_code}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <Link
                    href={`/ledger?accountCode=${item.account_code}${startDate ? `&startDate=${startDate}` : ""}${endDate ? `&endDate=${endDate}` : ""}`}
                    className="hover:text-primary hover:underline decoration-dotted cursor-pointer transition-colors"
                    title="Click to view ledger transactions for this account"
                  >
                    {item.account_name}
                  </Link>
                </TableCell>
                <TableCell className="text-right font-medium">
                  <Link
                    href={`/ledger?accountCode=${item.account_code}${startDate ? `&startDate=${startDate}` : ""}${endDate ? `&endDate=${endDate}` : ""}`}
                    className="hover:text-primary hover:underline decoration-dotted cursor-pointer transition-colors font-medium"
                    title="Click to view ledger transactions for this account"
                  >
                    {formatCurrency(item.amount)}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </>
        )}
        {showSubtotal && (
          <TableRow className="bg-muted/30 font-semibold">
            <TableCell colSpan={2}>Total {title}</TableCell>
            <TableCell className="text-right">
              {formatCurrency(subtotal)}
            </TableCell>
          </TableRow>
        )}
      </>
    );
  };

  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Code</TableHead>
            <TableHead>Account</TableHead>
            <TableHead className="text-right w-[150px]">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* ASSETS */}
          <TableRow className="bg-primary/10">
            <TableHead colSpan={3} className="font-bold text-lg py-4">
              ASSETS
            </TableHead>
          </TableRow>

          {/* Current Assets */}
          {renderSection("Current Assets", currentAssets, true, totals.totalCurrentAssets)}

          {/* Non-Current Assets */}
          {renderSection("Non-Current Assets", nonCurrentAssets, true, totals.totalNonCurrentAssets)}

          {/* Total Assets */}
          <TableRow className="bg-muted/50 font-bold border-t-2">
            <TableCell colSpan={2} className="text-lg py-4">
              TOTAL ASSETS
            </TableCell>
            <TableCell className="text-right text-lg py-4">
              {formatCurrency(totals.totalAssets)}
            </TableCell>
          </TableRow>

          {/* LIABILITIES & EQUITY */}
          <TableRow className="bg-primary/10">
            <TableHead colSpan={3} className="font-bold text-lg py-4">
              LIABILITIES & EQUITY
            </TableHead>
          </TableRow>

          {/* Current Liabilities */}
          {renderSection("Current Liabilities", currentLiabilities, true, totals.totalCurrentLiabilities)}

          {/* Non-Current Liabilities */}
          {renderSection("Non-Current Liabilities", nonCurrentLiabilities, true, totals.totalNonCurrentLiabilities)}

          {/* Total Liabilities */}
          <TableRow className="bg-muted/30 font-semibold">
            <TableCell colSpan={2}>Total Liabilities</TableCell>
            <TableCell className="text-right">
              {formatCurrency(totals.totalLiabilities)}
            </TableCell>
          </TableRow>

          {/* Equity */}
          {renderSection("Equity", equity, true, totals.totalEquity)}

          {/* Total Liabilities & Equity */}
          <TableRow className="bg-muted/50 font-bold border-t-2">
            <TableCell colSpan={2} className="text-lg py-4">
              TOTAL LIABILITIES & EQUITY
            </TableCell>
            <TableCell className="text-right text-lg py-4">
              {formatCurrency(totals.totalLiabilitiesAndEquity)}
            </TableCell>
          </TableRow>

          {/* Balance Check */}
          {totals.totalAssets !== totals.totalLiabilitiesAndEquity && (
            <TableRow className="bg-destructive/10">
              <TableCell colSpan={3} className="text-center text-destructive font-semibold">
                ⚠️ Balance Sheet does not balance! Difference: {formatCurrency(Math.abs(totals.totalAssets - totals.totalLiabilitiesAndEquity))}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}


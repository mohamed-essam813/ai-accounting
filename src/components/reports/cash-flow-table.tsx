"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";
import type { CashFlowLineItem } from "@/lib/data/reports-detailed";

type Props = {
  data: {
    operating: CashFlowLineItem[];
    investing: CashFlowLineItem[];
    financing: CashFlowLineItem[];
    totals: {
      operatingCashFlow: number;
      investingCashFlow: number;
      financingCashFlow: number;
      netCashFlow: number;
    };
  };
  startDate?: string;
  endDate?: string;
};

export function CashFlowTable({ data, startDate, endDate }: Props) {
  const { operating, investing, financing, totals } = data;

  const renderSection = (
    title: string,
    items: CashFlowLineItem[],
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
            <TableCell colSpan={2}>Net Cash from {title}</TableCell>
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
          {/* Operating Activities */}
          {renderSection("Operating Activities", operating, true, totals.operatingCashFlow)}

          {/* Investing Activities */}
          {renderSection("Investing Activities", investing, true, totals.investingCashFlow)}

          {/* Financing Activities */}
          {renderSection("Financing Activities", financing, true, totals.financingCashFlow)}

          {/* Net Cash Flow */}
          <TableRow className="bg-primary/10 font-bold border-t-2 border-primary">
            <TableCell colSpan={2} className="text-primary text-lg py-4">
              Net Cash Flow
            </TableCell>
            <TableCell className="text-right text-primary text-lg py-4">
              {formatCurrency(totals.netCashFlow)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}


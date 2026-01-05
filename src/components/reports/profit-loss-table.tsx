"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";
import type { PLLineItem } from "@/lib/data/reports-detailed";

type Props = {
  data: {
    revenue: PLLineItem[];
    costOfSales: PLLineItem[];
    operatingExpenses: PLLineItem[];
    otherIncome: PLLineItem[];
    gainLoss: PLLineItem[];
    totals: {
      totalRevenue: number;
      totalCostOfSales: number;
      grossProfit: number;
      totalOperatingExpenses: number;
      operatingProfit: number;
      totalOtherIncome: number;
      gainLossOnDisposal: number;
      netProfit: number;
    };
  };
  startDate?: string;
  endDate?: string;
};

export function ProfitLossTable({ data, startDate, endDate }: Props) {
  const {
    revenue,
    costOfSales,
    operatingExpenses,
    otherIncome,
    gainLoss,
    totals,
  } = data;

  const renderSection = (
    title: string,
    items: PLLineItem[],
    showSubtotal: boolean,
    subtotal: number,
    isHighlight: boolean = false
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
                    href={`/ledger?accountCode=${item.account_code}`}
                    className="hover:text-primary hover:underline decoration-dotted"
                    title="Click to view ledger transactions"
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
          <TableRow className={isHighlight ? "bg-primary/10 font-semibold" : "bg-muted/30 font-semibold"}>
            <TableCell colSpan={2} className={`py-3 ${isHighlight ? "text-primary" : ""}`}>
              {title === "Revenue" ? "Total Revenue" :
               title === "Cost of Sales" ? "Total Cost of Sales" :
               title === "Operating Expenses" ? "Total Operating Expenses" :
               title === "Other Income" ? "Total Other Income" :
               title === "Gain/Loss on Disposal" ? "Gain/Loss on Disposal" :
               "Subtotal"}
            </TableCell>
            <TableCell className={`text-right py-3 ${isHighlight ? "text-primary" : ""}`}>
              <span className="cursor-default">{formatCurrency(subtotal)}</span>
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
          {/* Revenue Section */}
          {renderSection("Revenue", revenue, true, totals.totalRevenue)}

          {/* Cost of Sales Section */}
          {renderSection("Cost of Sales", costOfSales, true, totals.totalCostOfSales)}

          {/* Gross Profit */}
          <TableRow className="bg-muted/50 font-semibold">
            <TableCell colSpan={2} className="py-3">Gross Profit</TableCell>
            <TableCell className="text-right py-3">
              <span className="cursor-default">{formatCurrency(totals.grossProfit)}</span>
            </TableCell>
          </TableRow>

          {/* Operating Expenses Section */}
          {renderSection("Operating Expenses", operatingExpenses, true, totals.totalOperatingExpenses)}

          {/* Operating Profit */}
          <TableRow className="bg-muted/50 font-semibold">
            <TableCell colSpan={2} className="py-3">Operating Profit</TableCell>
            <TableCell className="text-right py-3">
              <span className="cursor-default">{formatCurrency(totals.operatingProfit)}</span>
            </TableCell>
          </TableRow>

          {/* Other Income Section */}
          {renderSection("Other Income", otherIncome, true, totals.totalOtherIncome)}

          {/* Gain/Loss on Disposal */}
          {gainLoss.length > 0 && renderSection("Gain/Loss on Disposal", gainLoss, true, totals.gainLossOnDisposal)}

          {/* Net Profit */}
          <TableRow className="bg-primary/10 font-bold border-t-2 border-primary">
            <TableCell colSpan={2} className="text-primary text-lg py-4">
              Net Profit
            </TableCell>
            <TableCell className="text-right text-primary text-lg py-4">
              {formatCurrency(totals.netProfit)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}


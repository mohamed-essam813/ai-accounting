/**
 * Accounts Receivable Ageing Table
 */

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ARAgeingItem, ARAgeingSummary } from "@/lib/data/ageing";

interface Props {
  items: ARAgeingItem[];
  summary?: ARAgeingSummary[];
  showSummary?: boolean;
}

export function ARAgeingTable({ items, summary, showSummary = true }: Props) {
  const totals = {
    current: items.reduce((sum, item) => sum + item.current_0_30, 0),
    days31_60: items.reduce((sum, item) => sum + item.days_31_60, 0),
    days61_90: items.reduce((sum, item) => sum + item.days_61_90, 0),
    days90Plus: items.reduce((sum, item) => sum + item.days_90_plus, 0),
    total: items.reduce((sum, item) => sum + item.outstanding_amount, 0),
  };

  return (
    <div className="space-y-4">
      {showSummary && summary && summary.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Current (0-30)</TableHead>
                <TableHead className="text-right">31-60 Days</TableHead>
                <TableHead className="text-right">61-90 Days</TableHead>
                <TableHead className="text-right">90+ Days</TableHead>
                <TableHead className="text-right">Total Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.map((row) => (
                <TableRow key={row.customer_name}>
                  <TableCell className="font-medium">{row.customer_name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.total_current)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.total_31_60)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.total_61_90)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.total_90_plus)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(row.total_outstanding)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Days Overdue</TableHead>
              <TableHead className="text-right">Current (0-30)</TableHead>
              <TableHead className="text-right">31-60 Days</TableHead>
              <TableHead className="text-right">61-90 Days</TableHead>
              <TableHead className="text-right">90+ Days</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                  No outstanding receivables.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {items.map((item) => (
                  <TableRow key={`${item.customer_name}-${item.invoice_number}`}>
                    <TableCell className="font-medium">{item.customer_name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.invoice_number || "—"}</TableCell>
                    <TableCell>{formatDate(item.due_date)}</TableCell>
                    <TableCell>
                      {item.days_overdue > 0 ? (
                        <Badge variant="destructive">{item.days_overdue} days</Badge>
                      ) : (
                        <Badge variant="secondary">Current</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.current_0_30 > 0 ? formatCurrency(item.current_0_30) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.days_31_60 > 0 ? formatCurrency(item.days_31_60) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.days_61_90 > 0 ? formatCurrency(item.days_61_90) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.days_90_plus > 0 ? formatCurrency(item.days_90_plus) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(item.outstanding_amount)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted font-semibold">
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.current)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.days31_60)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.days61_90)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.days90Plus)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totals.total)}</TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}


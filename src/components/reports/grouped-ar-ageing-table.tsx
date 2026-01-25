/**
 * Grouped AR Ageing Table with Pivot-Table Features
 * Excel Elimination Doctrine: Pivot-Table-Level Reporting
 * 
 * Features:
 * - Grouping by customer
 * - Expand/collapse by customer
 * - Subtotals per customer
 * - Sorting capabilities
 */

"use client";

import { useState, Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ARAgeingItem, ARAgeingSummary } from "@/lib/data/ageing";

interface Props {
  items: ARAgeingItem[];
  summary?: ARAgeingSummary[];
  showSummary?: boolean;
  displayCurrency?: string;
}

type SortField = "customer" | "outstanding" | "days_overdue";
type SortDirection = "asc" | "desc";

export function GroupedARAgeingTable({ items, summary, showSummary = true, displayCurrency = "AED" }: Props) {
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("outstanding");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Group items by customer
  const grouped = items.reduce((acc, item) => {
    const customer = item.customer_name;
    if (!acc[customer]) {
      acc[customer] = {
        customer,
        invoices: [],
        totalCurrent: 0,
        total31_60: 0,
        total61_90: 0,
        total90Plus: 0,
        totalOutstanding: 0,
        maxDaysOverdue: 0,
      };
    }
    acc[customer].invoices.push(item);
    acc[customer].totalCurrent += item.current_0_30;
    acc[customer].total31_60 += item.days_31_60;
    acc[customer].total61_90 += item.days_61_90;
    acc[customer].total90Plus += item.days_90_plus;
    acc[customer].totalOutstanding += item.outstanding_amount;
    acc[customer].maxDaysOverdue = Math.max(acc[customer].maxDaysOverdue, item.days_overdue);
    return acc;
  }, {} as Record<string, {
    customer: string;
    invoices: ARAgeingItem[];
    totalCurrent: number;
    total31_60: number;
    total61_90: number;
    total90Plus: number;
    totalOutstanding: number;
    maxDaysOverdue: number;
  }>);

  // Sort groups
  const sortedGroups = Object.values(grouped).sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case "customer":
        comparison = a.customer.localeCompare(b.customer);
        break;
      case "outstanding":
        comparison = a.totalOutstanding - b.totalOutstanding;
        break;
      case "days_overdue":
        comparison = a.maxDaysOverdue - b.maxDaysOverdue;
        break;
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const toggleCustomer = (customer: string) => {
    const newExpanded = new Set(expandedCustomers);
    if (newExpanded.has(customer)) {
      newExpanded.delete(customer);
    } else {
      newExpanded.add(customer);
    }
    setExpandedCustomers(newExpanded);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const totals = {
    current: items.reduce((sum, item) => sum + item.current_0_30, 0),
    days31_60: items.reduce((sum, item) => sum + item.days_31_60, 0),
    days61_90: items.reduce((sum, item) => sum + item.days_61_90, 0),
    days90Plus: items.reduce((sum, item) => sum + item.days_90_plus, 0),
    total: items.reduce((sum, item) => sum + item.outstanding_amount, 0),
  };

  return (
    <div className="space-y-4">
      {/* Summary Table (Customer-level totals) */}
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
                  <TableCell className="text-right">{formatCurrency(row.total_current, displayCurrency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.total_31_60, displayCurrency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.total_61_90, displayCurrency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.total_90_plus, displayCurrency)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(row.total_outstanding, displayCurrency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detailed Table with Grouping */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-2"
                  onClick={() => handleSort("customer")}
                >
                  Customer
                  <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-2"
                  onClick={() => handleSort("days_overdue")}
                >
                  Days Overdue
                  <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="text-right">Current (0-30)</TableHead>
              <TableHead className="text-right">31-60 Days</TableHead>
              <TableHead className="text-right">61-90 Days</TableHead>
              <TableHead className="text-right">90+ Days</TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-2"
                  onClick={() => handleSort("outstanding")}
                >
                  Outstanding
                  <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                  No outstanding receivables.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {sortedGroups.map((group) => {
                  const isExpanded = expandedCustomers.has(group.customer);
                  const hasOverdue = group.maxDaysOverdue > 0;

                  return (
                    <Fragment key={group.customer}>
                      {/* Customer Group Header */}
                      <TableRow className="bg-muted/50 font-semibold hover:bg-muted/70">
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleCustomer(group.customer)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{group.customer}</TableCell>
                        <TableCell colSpan={3}>
                          {hasOverdue && (
                            <Badge variant="destructive" className="text-xs">
                              {group.maxDaysOverdue} days overdue
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {group.totalCurrent > 0 ? formatCurrency(group.totalCurrent, displayCurrency) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {group.total31_60 > 0 ? formatCurrency(group.total31_60, displayCurrency) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {group.total61_90 > 0 ? formatCurrency(group.total61_90, displayCurrency) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {group.total90Plus > 0 ? formatCurrency(group.total90Plus, displayCurrency) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatCurrency(group.totalOutstanding, displayCurrency)}
                        </TableCell>
                      </TableRow>

                      {/* Customer Invoices (when expanded) */}
                      {isExpanded &&
                        group.invoices
                          .sort((a, b) => b.days_overdue - a.days_overdue)
                          .map((item) => (
                            <TableRow key={`${item.customer_name}-${item.invoice_number}`} className="hover:bg-muted/30">
                              <TableCell></TableCell>
                              <TableCell className="pl-6">{item.customer_name}</TableCell>
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
                                {item.current_0_30 > 0 ? formatCurrency(item.current_0_30, displayCurrency) : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.days_31_60 > 0 ? formatCurrency(item.days_31_60, displayCurrency) : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.days_61_90 > 0 ? formatCurrency(item.days_61_90, displayCurrency) : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.days_90_plus > 0 ? formatCurrency(item.days_90_plus, displayCurrency) : "—"}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatCurrency(item.outstanding_amount, displayCurrency)}
                              </TableCell>
                            </TableRow>
                          ))}
                    </Fragment>
                  );
                })}

                {/* Grand Total Row */}
                <TableRow className="bg-primary/5 font-bold border-t-2">
                  <TableCell colSpan={5} className="font-semibold">
                    Grand Total
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(totals.current, displayCurrency)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(totals.days31_60, displayCurrency)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(totals.days61_90, displayCurrency)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(totals.days90Plus, displayCurrency)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(totals.total, displayCurrency)}
                  </TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}


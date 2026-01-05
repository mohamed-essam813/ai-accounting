"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Package } from "lucide-react";
import type { InventoryItem, InventorySummary } from "@/lib/data/inventory";

type Props = {
  items: InventoryItem[];
  summary: InventorySummary[];
};

export function InventoryTable({ items, summary }: Props) {
  // Create a map of item_id to summary for quick lookup
  const summaryMap = new Map(summary.map((s) => [s.item_id, s]));

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">
          No inventory items yet. Create your first item to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-left">Item Name</TableHead>
            <TableHead className="text-left">SKU</TableHead>
            <TableHead className="text-left">Valuation Method</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Unit Cost</TableHead>
            <TableHead className="text-right">Total Value</TableHead>
            <TableHead className="text-left">Ageing</TableHead>
            <TableHead className="text-right" style={{ paddingRight: '1rem' }}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const itemSummary = summaryMap.get(item.id);
            const hasAgeing = itemSummary && (
              itemSummary.quantity_31_60 > 0 ||
              itemSummary.quantity_61_90 > 0 ||
              itemSummary.quantity_90_plus > 0
            );

            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-left">{item.name}</TableCell>
                <TableCell className="text-muted-foreground text-left">
                  {item.sku || "-"}
                </TableCell>
                <TableCell className="text-left">
                  <Badge variant="outline">
                    {item.valuation_method === "fifo" ? "FIFO" : "Weighted Avg"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {itemSummary ? itemSummary.quantity.toFixed(2) : "0.00"} {item.unit}
                </TableCell>
                <TableCell className="text-right">
                  {itemSummary?.average_cost
                    ? formatCurrency(itemSummary.average_cost)
                    : "-"}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {itemSummary ? formatCurrency(itemSummary.total_value) : formatCurrency(0)}
                </TableCell>
                <TableCell className="text-left">
                  {hasAgeing ? (
                    <Badge variant="destructive" className="text-xs">
                      Ageing
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">Current</span>
                  )}
                </TableCell>
                <TableCell className="text-right" style={{ paddingRight: '1rem' }}>
                  <Link href={`/inventory/${item.id}`}>
                    <Button variant="ghost" size="sm">
                      View
                      <ArrowRight className="ml-2 h-3 w-3" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}


"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { InventorySummary } from "@/lib/data/inventory";

type Props = {
  summary: InventorySummary[];
};

export function InventorySummaryCard({ summary }: Props) {
  const totalValue = summary.reduce((sum, item) => sum + item.total_value, 0);
  const totalQuantity = summary.reduce((sum, item) => sum + item.quantity, 0);
  const totalAgeing = summary.reduce(
    (sum, item) =>
      sum + item.quantity_31_60 + item.quantity_61_90 + item.quantity_90_plus,
    0,
  );

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total Quantity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{totalQuantity.toFixed(2)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Ageing Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{totalAgeing.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Items over 30 days in stock
          </p>
        </CardContent>
      </Card>
    </div>
  );
}


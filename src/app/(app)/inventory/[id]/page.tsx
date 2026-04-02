import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { formatDate } from "@/lib/format";
import {
  getInventoryItem,
  getInventoryBalance,
  getInventoryAgeing,
  getInventoryTransactions,
} from "@/lib/data/inventory";
import { ArrowLeft, Package } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Item detail must reflect postings immediately.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: Promise<{ id: string }>;
};

export default async function InventoryItemPage(props: Props) {
  const params = await props.params;
  const itemId = params.id;

  const [item, balance, ageing, transactions] = await Promise.all([
    getInventoryItem(itemId),
    getInventoryBalance(itemId),
    getInventoryAgeing(itemId),
    getInventoryTransactions(itemId, 20),
  ]);

  if (!item) {
    notFound();
  }

  // Calculate ageing summary
  const ageingSummary = {
    "0-30": ageing.filter((a) => a.ageing_bucket === "0-30").reduce((sum, a) => sum + a.quantity, 0),
    "31-60": ageing.filter((a) => a.ageing_bucket === "31-60").reduce((sum, a) => sum + a.quantity, 0),
    "61-90": ageing.filter((a) => a.ageing_bucket === "61-90").reduce((sum, a) => sum + a.quantity, 0),
    "90+": ageing.filter((a) => a.ageing_bucket === "90+").reduce((sum, a) => sum + a.quantity, 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/inventory">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Inventory
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-semibold">{item.name}</h2>
          <p className="text-sm text-muted-foreground">Inventory Item Details</p>
        </div>
      </div>

      {/* Item Overview */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Item Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">SKU</p>
              <p className="font-medium">{item.sku || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Unit</p>
              <p className="font-medium">{item.unit}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valuation Method</p>
              <Badge variant="outline" className="mt-1">
                {item.valuation_method === "fifo" ? "FIFO" : "Weighted Average"}
              </Badge>
            </div>
            {item.description && (
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="font-medium">{item.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current Balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Quantity</p>
              <p className="text-2xl font-semibold">
                {balance ? balance.quantity.toFixed(2) : "0.00"} {item.unit}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Average Cost</p>
              <p className="text-xl font-medium">
                {balance?.average_cost ? formatCurrency(balance.average_cost) : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="text-xl font-semibold text-primary">
                {balance ? formatCurrency(balance.total_value) : formatCurrency(0)}
              </p>
            </div>
            {balance?.last_transaction_date && (
              <div>
                <p className="text-sm text-muted-foreground">Last Transaction</p>
                <p className="font-medium">{formatDate(balance.last_transaction_date)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ageing Breakdown */}
      {ageing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inventory Ageing</CardTitle>
            <p className="text-sm text-muted-foreground">
              Breakdown of inventory by days in stock
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4 mb-6">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">0-30 Days</p>
                <p className="text-2xl font-semibold">
                  {ageingSummary["0-30"].toFixed(2)} {item.unit}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">31-60 Days</p>
                <p className="text-2xl font-semibold">
                  {ageingSummary["31-60"].toFixed(2)} {item.unit}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">61-90 Days</p>
                <p className="text-2xl font-semibold">
                  {ageingSummary["61-90"].toFixed(2)} {item.unit}
                </p>
              </div>
              <div className="rounded-lg border p-4 border-destructive/50 bg-destructive/5">
                <p className="text-sm text-muted-foreground">90+ Days</p>
                <p className="text-2xl font-semibold text-destructive">
                  {ageingSummary["90+"].toFixed(2)} {item.unit}
                </p>
              </div>
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Purchase Date</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead className="text-right">Days in Stock</TableHead>
                    <TableHead>Ageing Bucket</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ageing.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{formatDate(a.purchase_date)}</TableCell>
                      <TableCell>{a.batch_number ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        {a.quantity.toFixed(2)} {item.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(a.unit_cost)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(a.total_value)}
                      </TableCell>
                      <TableCell className="text-right">{a.days_in_stock}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            a.ageing_bucket === "90+"
                              ? "destructive"
                              : a.ageing_bucket === "61-90"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {a.ageing_bucket} days
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Transactions */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Transactions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Last 20 transactions for this item
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead>Batch #</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell>{formatDate(txn.date)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            txn.transaction_type === "purchase"
                              ? "default"
                              : txn.transaction_type === "sale"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {txn.transaction_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {txn.quantity.toFixed(2)} {item.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(txn.unit_cost)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(txn.total_cost)}
                      </TableCell>
                      <TableCell>{txn.batch_number ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {ageing.length === 0 && transactions.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              No ageing data or transactions found for this item.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


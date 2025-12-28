/**
 * Inventory Management Page
 * MVP Feedback Section 7: Inventory Module
 */

import { getInventoryItems, getInventorySummary } from "@/lib/data/inventory";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { InventoryItemForm } from "@/components/inventory/inventory-item-form";
import { InventorySummaryCard } from "@/components/inventory/inventory-summary-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const revalidate = 60;

export default async function InventoryPage() {
  const [items, summary] = await Promise.all([
    getInventoryItems(),
    getInventorySummary(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Inventory Management</h2>
        <p className="text-sm text-muted-foreground">
          Track inventory items, manage purchases and sales, and monitor inventory valuation (FIFO or Weighted Average).
        </p>
      </div>

      {/* Inventory Summary */}
      {summary.length > 0 && (
        <InventorySummaryCard summary={summary} />
      )}

      <Tabs defaultValue="items" className="space-y-4">
        <TabsList>
          <TabsTrigger value="items">Inventory Items</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add New Inventory Item</CardTitle>
            </CardHeader>
            <CardContent>
              <InventoryItemForm />
            </CardContent>
          </Card>
          <InventoryTable items={items} summary={summary} />
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Inventory Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Inventory transactions are created when you post purchases or sales through the Prompt Workspace or Journals.
                View transaction history for each item in the Inventory Items tab.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


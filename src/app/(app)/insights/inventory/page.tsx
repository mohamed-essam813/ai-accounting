/**
 * Insight Detail View - Inventory
 * UX Composition Section 3: SCREEN 2 - Insight Detail View
 * Engineering Guide Section 2.2: Insight Screens (Understanding Zone)
 * 
 * Question It Answers: "Explain what's happening with inventory and why it matters."
 * 
 * NOTE: Inventory module is not yet implemented (Phase 2)
 * This is a placeholder screen that will be populated when inventory functionality is added.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

export const revalidate = 60;

export default async function InventoryInsightPage() {
  return (
    <div className="space-y-6">
      {/* Section A: Insight Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Inventory Insight</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Inventory Module Coming Soon</AlertTitle>
            <AlertDescription>
              The inventory module is planned for Phase 2 implementation. This will include:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Inventory valuation methods (FIFO and Weighted Average)</li>
                <li>COGS calculation</li>
                <li>Inventory ageing tracking</li>
                <li>Inventory insights based on movement and valuation</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Placeholder sections for future implementation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ageing Breakdown</CardTitle>
          <p className="text-sm text-muted-foreground">
            Inventory grouped by days in stock (when implemented)
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Inventory ageing analysis will be available once the inventory module is implemented.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Business Impact</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Inventory insights will explain how inventory levels affect cash flow, working capital, and operational efficiency.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}


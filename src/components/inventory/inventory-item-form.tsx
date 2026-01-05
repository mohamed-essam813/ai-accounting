"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createInventoryItemAction } from "@/lib/actions/inventory";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

type Props = {
  valuationMethod: "fifo" | "weighted_average";
};

export function InventoryItemForm({ valuationMethod }: Props) {
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    description: "",
    unit: "unit",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createInventoryItemAction(formData);
        toast.success("Inventory item created successfully");
        // Reset form
        setFormData({
          name: "",
          sku: "",
          description: "",
          unit: "unit",
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to create inventory item",
        );
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Item Name *
          </label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="e.g., Widget A"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="sku" className="text-sm font-medium">
            SKU
          </label>
          <Input
            id="sku"
            value={formData.sku}
            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            placeholder="e.g., WID-A-001"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Item description"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="unit" className="text-sm font-medium">
          Unit
        </label>
        <Input
          id="unit"
          value={formData.unit}
          onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
          placeholder="e.g., piece, kg, liter"
        />
      </div>

      {/* Read-only valuation method display */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Inventory valuation method: <strong>{valuationMethod === "fifo" ? "FIFO (First-In, First-Out)" : "Weighted Average"}</strong> (company setting)
        </AlertDescription>
      </Alert>

      <Button type="submit" disabled={isPending || !formData.name}>
        {isPending ? "Creating..." : "Create Inventory Item"}
      </Button>
    </form>
  );
}


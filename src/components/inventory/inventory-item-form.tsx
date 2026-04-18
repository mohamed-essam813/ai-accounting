"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createInventoryItemAction, updateInventoryItemAction } from "@/lib/actions/inventory";
import type { InventoryItem } from "@/lib/data/inventory";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Plus } from "lucide-react";
import { listUnitsOfMeasureAction, type UnitOfMeasure } from "@/lib/actions/units-of-measure";

type Props = {
  valuationMethod: "fifo" | "weighted_average";
  item?: InventoryItem | null; // For edit mode
  onSuccess?: () => void;
};

export function InventoryItemForm({ valuationMethod, item, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const [uoms, setUOMs] = useState<UnitOfMeasure[]>([]);
  const [loadingUOMs, setLoadingUOMs] = useState(true);
  const isEditMode = !!item;
  
  const [formData, setFormData] = useState({
    name: item?.name || "",
    sku: item?.sku || "",
    description: item?.description || "",
    uom_id: (item as any)?.uom_id || "",
  });

  // Load UOMs on mount or when item changes
  useEffect(() => {
    listUnitsOfMeasureAction()
      .then((data) => {
        setUOMs(data);
        // Set default to "unit" if available and not in edit mode
        if (!isEditMode) {
          const defaultUnit = data.find((uom) => uom.abbreviation === "unit");
          if (defaultUnit && !formData.uom_id) {
            setFormData((prev) => ({ ...prev, uom_id: defaultUnit.id }));
          }
        }
      })
      .catch((error) => {
        console.error("Failed to load units of measure:", error);
        toast.error("Failed to load units of measure");
      })
      .finally(() => {
        setLoadingUOMs(false);
      });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (isEditMode && item) {
          await updateInventoryItemAction({ ...formData, id: item.id });
          toast.success("Inventory item updated successfully");
          onSuccess?.();
        } else {
          await createInventoryItemAction(formData);
          toast.success("Inventory item created successfully");
          // Reset form
          const defaultUnit = uoms.find((uom) => uom.abbreviation === "unit");
          setFormData({
            name: "",
            sku: "",
            description: "",
            uom_id: defaultUnit?.id || "",
          });
          onSuccess?.();
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : isEditMode ? "Failed to update inventory item" : "Failed to create inventory item",
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
        <div className="flex items-center justify-between">
          <label htmlFor="uom_id" className="text-sm font-medium">
            Unit of Measure *
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              // Navigate to settings page with UOM form open
              window.location.href = "/settings#accounting-preferences";
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Unit
          </Button>
        </div>
        {loadingUOMs ? (
          <Input disabled placeholder="Loading units..." />
        ) : (
          <Select
            value={formData.uom_id}
            onValueChange={(value) => setFormData({ ...formData, uom_id: value })}
            required
          >
            <SelectTrigger id="uom_id">
              <SelectValue placeholder="Select unit of measure" />
            </SelectTrigger>
            <SelectContent>
              {uoms.map((uom) => (
                <SelectItem key={uom.id} value={uom.id}>
                  {uom.name} ({uom.abbreviation})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          Select the unit of measure for this inventory item
        </p>
      </div>

      {/* Read-only valuation method display */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Inventory valuation method: <strong>{valuationMethod === "fifo" ? "FIFO (First-In, First-Out)" : "Weighted Average"}</strong> (company setting)
        </AlertDescription>
      </Alert>

      <Button type="submit" disabled={isPending || !formData.name}>
        {isPending ? (isEditMode ? "Updating..." : "Creating...") : (isEditMode ? "Update Inventory Item" : "Create Inventory Item")}
      </Button>
    </form>
  );
}


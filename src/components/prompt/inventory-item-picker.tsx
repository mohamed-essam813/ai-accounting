/**
 * Inventory Item Picker Component
 * Used in Create Invoice/Bill to search and select inventory items by SKU or name
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, X } from "lucide-react";
import type { InventoryItem } from "@/lib/data/inventory";

type InventoryLineItem = {
  item_id: string;
  item_name: string;
  item_sku: string | null;
  quantity: number;
  rate: number;
  discount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
};

type Props = {
  items: InventoryItem[];
  selectedItems: InventoryLineItem[];
  onItemsChange: (items: InventoryLineItem[]) => void;
  disabled?: boolean;
};

export function InventoryItemPicker({
  items,
  selectedItems,
  onItemsChange,
  disabled = false,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Filter items by search query (SKU or name)
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return items.filter((item) => item.is_active);
    }

    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.is_active &&
        (item.name.toLowerCase().includes(query) ||
          (item.sku && item.sku.toLowerCase().includes(query)))
    );
  }, [items, searchQuery]);

  const addItem = (item: InventoryItem) => {
    const newLineItem: InventoryLineItem = {
      item_id: item.id,
      item_name: item.name,
      item_sku: item.sku,
      quantity: 1,
      rate: 0,
      discount: 0,
      tax_rate: 0,
      tax_amount: 0,
      total: 0,
    };
    onItemsChange([...selectedItems, newLineItem]);
    setIsDialogOpen(false);
    setSearchQuery("");
  };

  const removeItem = (itemId: string) => {
    onItemsChange(selectedItems.filter((item) => item.item_id !== itemId));
  };

  const updateItem = (itemId: string, field: keyof InventoryLineItem, value: number) => {
    const updated = selectedItems.map((item) => {
      if (item.item_id !== itemId) return item;

      const updatedItem = { ...item, [field]: value };

      // Recalculate total when quantity, rate, discount, or tax changes
      if (field === "quantity" || field === "rate" || field === "discount" || field === "tax_rate") {
        const subtotal = updatedItem.quantity * updatedItem.rate;
        const discountAmount = (subtotal * updatedItem.discount) / 100;
        const afterDiscount = subtotal - discountAmount;
        updatedItem.tax_amount = (afterDiscount * updatedItem.tax_rate) / 100;
        updatedItem.total = afterDiscount + updatedItem.tax_amount;
      }

      return updatedItem;
    });

    onItemsChange(updated);
  };

  const totalAmount = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.total, 0);
  }, [selectedItems]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Inventory Line Items</label>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={disabled}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select Inventory Item</DialogTitle>
              <DialogDescription>
                Search by SKU or name to add items to your invoice/bill
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by SKU or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {filteredItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {searchQuery ? "No items found matching your search." : "No active inventory items available."}
                </p>
              ) : (
                <div className="border rounded-md max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="w-[100px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">
                            {item.sku || "-"}
                          </TableCell>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.unit}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addItem(item)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {selectedItems.length > 0 && (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Discount %</TableHead>
                <TableHead className="text-right">Tax %</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedItems.map((item) => (
                <TableRow key={item.item_id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{item.item_name}</div>
                      {item.item_sku && (
                        <div className="text-xs text-muted-foreground font-mono">
                          SKU: {item.item_sku}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(item.item_id, "quantity", parseFloat(e.target.value) || 0)
                      }
                      className="w-20 text-right"
                      disabled={disabled}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.rate}
                      onChange={(e) =>
                        updateItem(item.item_id, "rate", parseFloat(e.target.value) || 0)
                      }
                      className="w-24 text-right"
                      disabled={disabled}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={item.discount}
                      onChange={(e) =>
                        updateItem(item.item_id, "discount", parseFloat(e.target.value) || 0)
                      }
                      className="w-20 text-right"
                      disabled={disabled}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={item.tax_rate}
                      onChange={(e) =>
                        updateItem(item.item_id, "tax_rate", parseFloat(e.target.value) || 0)
                      }
                      className="w-20 text-right"
                      disabled={disabled}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {item.total.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.item_id)}
                      disabled={disabled}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t p-4">
            <div className="flex justify-end">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Amount</div>
                <div className="text-lg font-semibold">{totalAmount.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

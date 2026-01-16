"use client";

import { useState, useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createUnitOfMeasureAction, updateUnitOfMeasureAction, deleteUnitOfMeasureAction } from "@/lib/actions/units-of-measure";
import { listUnitsOfMeasure, type UnitOfMeasure } from "@/lib/data/units-of-measure";

const UOMFormSchema = z.object({
  name: z.string().min(1, "Unit name is required"),
  abbreviation: z.string().min(1, "Abbreviation is required"),
  category: z.enum(["weight", "volume", "length", "count", "other"]),
});

type UOMFormValues = z.infer<typeof UOMFormSchema>;

const categoryLabels: Record<UOMFormValues["category"], string> = {
  weight: "Weight",
  volume: "Volume",
  length: "Length",
  count: "Count",
  other: "Other",
};

export function UnitsOfMeasureForm() {
  const [uoms, setUOMs] = useState<UnitOfMeasure[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUOM, setEditingUOM] = useState<UnitOfMeasure | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<UOMFormValues>({
    resolver: zodResolver(UOMFormSchema),
    defaultValues: {
      name: "",
      abbreviation: "",
      category: "count",
    },
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await listUnitsOfMeasure();
      setUOMs(data);
    } catch (error) {
      console.error("Failed to load units of measure:", error);
      toast.error("Failed to load units of measure");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (uom?: UnitOfMeasure) => {
    if (uom) {
      setEditingUOM(uom);
      form.reset({
        name: uom.name,
        abbreviation: uom.abbreviation,
        category: uom.category,
      });
    } else {
      setEditingUOM(null);
      form.reset({
        name: "",
        abbreviation: "",
        category: "count",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingUOM(null);
    form.reset();
  };

  const handleSubmit = (values: UOMFormValues) => {
    startTransition(async () => {
      try {
        if (editingUOM) {
          await updateUnitOfMeasureAction({
            id: editingUOM.id,
            ...values,
          });
          toast.success("Unit updated");
        } else {
          await createUnitOfMeasureAction(values);
          toast.success("Unit created");
        }
        handleCloseDialog();
        await loadData();
      } catch (error) {
        console.error("Failed to save unit:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to save unit"
        );
      }
    });
  };

  const handleDelete = (id: string, isSystem: boolean) => {
    if (isSystem) {
      toast.error("System units cannot be deleted. You can deactivate them instead.");
      return;
    }

    if (!confirm("Are you sure you want to delete this unit?")) return;

    startTransition(async () => {
      try {
        await deleteUnitOfMeasureAction(id);
        toast.success("Unit deleted");
        await loadData();
      } catch (error) {
        console.error("Failed to delete unit:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to delete unit"
        );
      }
    });
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading units of measure...</div>;
  }

  // Group UOMs by category
  const groupedUOMs = uoms.reduce((acc, uom) => {
    if (!acc[uom.category]) {
      acc[uom.category] = [];
    }
    acc[uom.category].push(uom);
    return acc;
  }, {} as Record<string, UnitOfMeasure[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Units of Measure</h3>
          <p className="text-sm text-muted-foreground">
            Manage units for inventory items. Common units like kg, litre, cm are pre-configured.
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Unit
        </Button>
      </div>

      {uoms.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border rounded-md">
          No units configured. Click "Add Unit" to create one.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedUOMs).map(([category, categoryUOMs]) => (
            <div key={category} className="border rounded-md">
              <div className="px-4 py-2 bg-muted border-b">
                <h4 className="text-sm font-semibold">{categoryLabels[category as UOMFormValues["category"]]}</h4>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Abbreviation</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryUOMs.map((uom) => (
                    <TableRow key={uom.id}>
                      <TableCell className="font-medium">{uom.name}</TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{uom.abbreviation}</span>
                      </TableCell>
                      <TableCell>
                        {uom.is_system && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            System
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(uom)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(uom.id, uom.is_system)}
                            disabled={isPending || uom.is_system}
                          >
                            <Trash2 className={`h-4 w-4 ${uom.is_system ? "text-muted-foreground" : "text-destructive"}`} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUOM ? "Edit Unit of Measure" : "Create Unit of Measure"}
            </DialogTitle>
            <DialogDescription>
              Configure a unit that can be assigned to inventory items.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Unit Name *</Label>
              <Input
                id="name"
                placeholder="e.g., kilogram, litre, centimeter"
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="abbreviation">Abbreviation *</Label>
                <Input
                  id="abbreviation"
                  placeholder="e.g., kg, L, cm"
                  {...form.register("abbreviation")}
                />
                {form.formState.errors.abbreviation && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.abbreviation.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={form.watch("category")}
                  onValueChange={(value: UOMFormValues["category"]) =>
                    form.setValue("category", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weight">Weight</SelectItem>
                    <SelectItem value="volume">Volume</SelectItem>
                    <SelectItem value="length">Length</SelectItem>
                    <SelectItem value="count">Count</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editingUOM?.is_system && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                This is a system unit and cannot be deleted.
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : editingUOM ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

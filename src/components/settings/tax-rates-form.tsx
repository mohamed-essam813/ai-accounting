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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, Edit } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createTaxRateAction, updateTaxRateAction, deleteTaxRateAction } from "@/lib/actions/tax-rates";
import { listTaxRates, type TaxRate } from "@/lib/data/tax-rates";
import { listAccounts } from "@/lib/data/accounts";
import type { Account } from "@/lib/accounting";

const TaxRateFormSchema = z.object({
  name: z.string().min(1, "Tax rate name is required"),
  percentage: z.number().min(0).max(100),
  tax_type: z.enum(["input", "output"]),
  output_vat_account_id: z.string().uuid().optional().nullable(),
  input_vat_account_id: z.string().uuid().optional().nullable(),
});

type TaxRateFormValues = z.infer<typeof TaxRateFormSchema>;

export function TaxRatesForm() {
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<TaxRateFormValues>({
    resolver: zodResolver(TaxRateFormSchema),
    defaultValues: {
      name: "",
      percentage: 0,
      tax_type: "output",
      output_vat_account_id: null,
      input_vat_account_id: null,
    },
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [ratesData, accountsData] = await Promise.all([
        listTaxRates(),
        listAccounts(),
      ]);
      setTaxRates(ratesData);
      setAccounts(accountsData);
    } catch (error) {
      console.error("Failed to load tax rates:", error);
      toast.error("Failed to load tax rates");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (rate?: TaxRate) => {
    if (rate) {
      setEditingRate(rate);
      form.reset({
        name: rate.name,
        percentage: rate.percentage,
        tax_type: rate.tax_type,
        output_vat_account_id: rate.output_vat_account_id,
        input_vat_account_id: rate.input_vat_account_id,
      });
    } else {
      setEditingRate(null);
      form.reset({
        name: "",
        percentage: 0,
        tax_type: "output",
        output_vat_account_id: null,
        input_vat_account_id: null,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingRate(null);
    form.reset();
  };

  const handleSubmit = (values: TaxRateFormValues) => {
    startTransition(async () => {
      try {
        if (editingRate) {
          await updateTaxRateAction({
            id: editingRate.id,
            ...values,
          });
          toast.success("Tax rate updated");
        } else {
          await createTaxRateAction(values);
          toast.success("Tax rate created");
        }
        handleCloseDialog();
        await loadData();
      } catch (error) {
        console.error("Failed to save tax rate:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to save tax rate"
        );
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this tax rate?")) return;

    startTransition(async () => {
      try {
        await deleteTaxRateAction(id);
        toast.success("Tax rate deleted");
        await loadData();
      } catch (error) {
        console.error("Failed to delete tax rate:", error);
        toast.error("Failed to delete tax rate");
      }
    });
  };

  // Get VAT accounts for selection
  const vatAccounts = accounts.filter(
    (acc) =>
      acc.code === "2100" || // VAT Output Tax
      acc.code === "5100" || // VAT Input Tax (if exists)
      acc.name.toLowerCase().includes("vat") ||
      acc.name.toLowerCase().includes("tax")
  );

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading tax rates...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Tax Rates</h3>
          <p className="text-sm text-muted-foreground">
            Configure tax rates once and select from dropdown when creating drafts.
            Tax amounts will be auto-calculated based on the selected rate.
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Tax Rate
        </Button>
      </div>

      {taxRates.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border rounded-md">
          No tax rates configured. Click "Add Tax Rate" to create one.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Percentage</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Output VAT Account</TableHead>
                <TableHead>Input VAT Account</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taxRates.map((rate) => {
                const outputAccount = accounts.find(
                  (acc) => acc.id === rate.output_vat_account_id
                );
                const inputAccount = accounts.find(
                  (acc) => acc.id === rate.input_vat_account_id
                );

                return (
                  <TableRow key={rate.id}>
                    <TableCell className="font-medium">{rate.name}</TableCell>
                    <TableCell>{rate.percentage}%</TableCell>
                    <TableCell>
                      <span className="capitalize">{rate.tax_type}</span>
                    </TableCell>
                    <TableCell>
                      {outputAccount
                        ? `${outputAccount.code} - ${outputAccount.name}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {inputAccount
                        ? `${inputAccount.code} - ${inputAccount.name}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(rate)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rate.id)}
                          disabled={isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRate ? "Edit Tax Rate" : "Create Tax Rate"}
            </DialogTitle>
            <DialogDescription>
              Configure a tax rate that can be selected when creating drafts.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Tax Rate Name *</Label>
              <Input
                id="name"
                placeholder="e.g., VAT 5%, GST 10%"
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
                <Label htmlFor="percentage">Percentage *</Label>
                <Input
                  id="percentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  {...form.register("percentage", { valueAsNumber: true })}
                />
                {form.formState.errors.percentage && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.percentage.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax_type">Tax Type *</Label>
                <Select
                  value={form.watch("tax_type")}
                  onValueChange={(value: "input" | "output") =>
                    form.setValue("tax_type", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="output">Output</SelectItem>
                    <SelectItem value="input">Input</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="output_vat_account_id">Output VAT Account</Label>
              <Select
                value={form.watch("output_vat_account_id") || ""}
                onValueChange={(value) =>
                  form.setValue("output_vat_account_id", value || null)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select output VAT account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {vatAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="input_vat_account_id">Input VAT Account</Label>
              <Select
                value={form.watch("input_vat_account_id") || ""}
                onValueChange={(value) =>
                  form.setValue("input_vat_account_id", value || null)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select input VAT account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {vatAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                {isPending ? "Saving..." : editingRate ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

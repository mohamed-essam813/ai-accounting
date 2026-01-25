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
import {
  createTaxRateAction,
  updateTaxRateAction,
  deleteTaxRateAction,
  listTaxRatesAction,
  type TaxRate,
} from "@/lib/actions/tax-rates";
import { listAccountsAction } from "@/lib/actions/accounts";
import type { Account } from "@/lib/accounting";

const TaxRateFormSchema = z
  .object({
    name: z.string().min(1, "Tax rate name is required"),
    percentage: z
      .number()
      .refine((n) => !Number.isNaN(n), "Enter a valid number")
      .refine((n) => n > 0, "Rate must be greater than 0")
      .refine((n) => n <= 100, "Rate cannot exceed 100"),
    tax_type: z.enum(["input", "output"]),
    output_vat_account_id: z.string().uuid().optional().nullable(),
    input_vat_account_id: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const msg = "Please create and select a tax control account first.";
    if (data.tax_type === "output") {
      if (!data.output_vat_account_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["output_vat_account_id"], message: msg });
      }
    } else {
      if (!data.input_vat_account_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["input_vat_account_id"], message: msg });
      }
    }
  });

type TaxRateFormValues = z.infer<typeof TaxRateFormSchema>;

const LINKED_ACCOUNT_MSG = "Please create and select a tax control account first.";

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
      percentage: 5,
      tax_type: "output",
      output_vat_account_id: null,
      input_vat_account_id: null,
    },
  });

  const taxType = form.watch("tax_type");

  useEffect(() => {
    loadData();
  }, []);

  const onTaxTypeChange = (v: "input" | "output") => {
    form.setValue("tax_type", v);
    form.setValue("output_vat_account_id", null);
    form.setValue("input_vat_account_id", null);
  };

  const loadData = async () => {
    try {
      const [ratesData, accountsData] = await Promise.all([
        listTaxRatesAction(),
        listAccountsAction(),
      ]);
      setTaxRates(ratesData);
      setAccounts(accountsData);
    } catch (e) {
      console.error("Failed to load tax rates", e);
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
        percentage: 5,
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

  const setServerFieldErrors = (fieldErrors: Record<string, string>) => {
    Object.entries(fieldErrors).forEach(([field, message]) => {
      form.setError(field as keyof TaxRateFormValues, { type: "server", message });
    });
  };

  const handleSubmit = (values: TaxRateFormValues) => {
    startTransition(async () => {
      form.clearErrors();
      if (editingRate) {
        const res = await updateTaxRateAction({ id: editingRate.id, ...values });
        if (res.success) {
          toast.success("Tax rate updated");
          handleCloseDialog();
          await loadData();
        } else {
          if (res.fieldErrors) setServerFieldErrors(res.fieldErrors);
          toast.error(res.error);
        }
      } else {
        const res = await createTaxRateAction(values);
        if (res.success) {
          toast.success("Tax rate created");
          handleCloseDialog();
          await loadData();
        } else {
          if (res.fieldErrors) setServerFieldErrors(res.fieldErrors);
          toast.error(res.error);
        }
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this tax rate?")) return;

    startTransition(async () => {
      const res = await deleteTaxRateAction(id);
      if (res.success) {
        toast.success("Tax rate deleted");
        await loadData();
      } else {
        toast.error(res.error);
      }
    });
  };

  const liabilityAccounts = accounts.filter((a) => a.type === "liability");
  const assetAccounts = accounts.filter((a) => a.type === "asset");

  const linkedAccountId =
    taxType === "output"
      ? form.watch("output_vat_account_id")
      : form.watch("input_vat_account_id");
  const linkedAccountField =
    taxType === "output" ? "output_vat_account_id" : "input_vat_account_id";
  const linkedOptions = taxType === "output" ? liabilityAccounts : assetAccounts;
  const linkedLabel =
    taxType === "output"
      ? "Output VAT account (Liability) *"
      : "Input VAT account (Asset) *";

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
          No tax rates configured. Click &quot;Add Tax Rate&quot; to create one.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Percentage</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Linked account</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taxRates.map((rate) => {
                const accountId =
                  rate.tax_type === "output"
                    ? rate.output_vat_account_id
                    : rate.input_vat_account_id;
                const account = accounts.find((a) => a.id === accountId);

                return (
                  <TableRow key={rate.id}>
                    <TableCell className="font-medium">{rate.name}</TableCell>
                    <TableCell>{rate.percentage}%</TableCell>
                    <TableCell>
                      <span className="capitalize">{rate.tax_type}</span>
                    </TableCell>
                    <TableCell>
                      {account
                        ? `${account.code} - ${account.name}`
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
              Output VAT must link to a liability account; Input VAT to an asset account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Tax rate name *</Label>
              <Input
                id="name"
                placeholder="e.g. VAT 5%, GST 10%"
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
                  min="0.01"
                  max="100"
                  placeholder="5"
                  {...form.register("percentage", { valueAsNumber: true })}
                />
                {form.formState.errors.percentage && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.percentage.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax_type">Tax type *</Label>
                <Select
                  value={form.watch("tax_type")}
                  onValueChange={(v: "input" | "output") => onTaxTypeChange(v)}
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
              <Label htmlFor={linkedAccountField}>{linkedLabel}</Label>
              <Select
                value={linkedAccountId ?? "none"}
                onValueChange={(v) =>
                  form.setValue(linkedAccountField, v === "none" ? null : v)
                }
              >
                <SelectTrigger disabled={linkedOptions.length === 0}>
                  <SelectValue
                    placeholder={
                      linkedOptions.length === 0
                        ? "No suitable account"
                        : `Select ${taxType === "output" ? "liability" : "asset"} account`
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select an account</SelectItem>
                  {linkedOptions.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkedOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {LINKED_ACCOUNT_MSG} Create a{" "}
                  {taxType === "output" ? "liability" : "asset"} account (e.g. VAT Output /
                  Input) in the chart of accounts first.
                </p>
              )}
              {(form.formState.errors.output_vat_account_id ??
                form.formState.errors.input_vat_account_id) && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.output_vat_account_id?.message ??
                    form.formState.errors.input_vat_account_id?.message}
                </p>
              )}
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
              <Button
                type="submit"
                disabled={isPending || linkedOptions.length === 0}
              >
                {isPending ? "Saving…" : editingRate ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

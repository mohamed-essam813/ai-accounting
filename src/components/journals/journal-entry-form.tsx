"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { createJournalEntryAction } from "@/lib/actions/journals";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";

const JournalLineSchema = z.object({
  account_id: z.string().uuid("Please select an account"),
  debit: z.number().min(0),
  credit: z.number().min(0),
  memo: z.string().optional(),
});

const JournalEntryFormSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  description: z.string().min(1, "Description is required"),
  lines: z
    .array(JournalLineSchema)
    .min(2, "At least 2 journal lines are required")
    .refine(
      (lines) => {
        const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
        const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
        return Math.abs(totalDebit - totalCredit) < 0.01;
      },
      { message: "Total debit must equal total credit" },
    ),
});

type FormValues = z.infer<typeof JournalEntryFormSchema>;

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type Props = {
  accounts: Account[];
};

export function JournalEntryForm({ accounts }: Props) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(JournalEntryFormSchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      description: "",
      lines: [
        { account_id: "", debit: 0, credit: 0, memo: "" },
        { account_id: "", debit: 0, credit: 0, memo: "" },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const accountOptions = accounts.map((account) => ({
    id: account.id,
    label: `${account.code} · ${account.name}`,
  }));

  const totalDebit = form.watch("lines").reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredit = form.watch("lines").reduce((sum, line) => sum + (line.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        await createJournalEntryAction({
          date: values.date,
          description: values.description,
          lines: values.lines.map((line) => ({
            account_id: line.account_id,
            debit: Number(line.debit),
            credit: Number(line.credit),
            memo: line.memo || null,
          })),
        });
        toast.success("Journal entry created");
        form.reset({
          date: new Date().toISOString().slice(0, 10),
          description: "",
          lines: [
            { account_id: "", debit: 0, credit: 0, memo: "" },
            { account_id: "", debit: 0, credit: 0, memo: "" },
          ],
        });
      } catch (error) {
        console.error(error);
        toast.error("Failed to create journal entry", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    });
  };

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Date</label>
          <Input type="date" {...form.register("date")} />
          {form.formState.errors.date ? (
            <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Description</label>
          <Input {...form.register("description")} placeholder="e.g., Monthly depreciation" />
          {form.formState.errors.description ? (
            <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Journal Lines</label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ account_id: "", debit: 0, credit: 0, memo: "" })}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Line
          </Button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-5">
              <div className="sm:col-span-2">
                <Select
                  value={form.watch(`lines.${index}.account_id`)}
                  onValueChange={(value) => form.setValue(`lines.${index}.account_id`, value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountOptions.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.lines?.[index]?.account_id ? (
                  <p className="mt-1 text-xs text-destructive">
                    {form.formState.errors.lines[index]?.account_id?.message}
                  </p>
                ) : null}
              </div>
              <div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Debit"
                  {...form.register(`lines.${index}.debit`, { valueAsNumber: true })}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    form.setValue(`lines.${index}.debit`, value);
                    form.setValue(`lines.${index}.credit`, 0);
                  }}
                />
              </div>
              <div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Credit"
                  {...form.register(`lines.${index}.credit`, { valueAsNumber: true })}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    form.setValue(`lines.${index}.credit`, value);
                    form.setValue(`lines.${index}.debit`, 0);
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Memo"
                  {...form.register(`lines.${index}.memo`)}
                  className="flex-1"
                />
                {fields.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {form.formState.errors.lines ? (
          <p className="text-xs text-destructive">{form.formState.errors.lines.message}</p>
        ) : null}

        <div className="flex items-center justify-between rounded-lg border bg-muted p-3">
          <div className="flex gap-6">
            <div>
              <span className="text-sm text-muted-foreground">Total Debit: </span>
              <span className="font-mono font-medium">{formatCurrency(totalDebit, "AED")}</span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Total Credit: </span>
              <span className="font-mono font-medium">{formatCurrency(totalCredit, "AED")}</span>
            </div>
          </div>
          <div>
            {isBalanced ? (
              <span className="text-sm text-green-600">✓ Balanced</span>
            ) : (
              <span className="text-sm text-destructive">
                Difference: {formatCurrency(Math.abs(totalDebit - totalCredit), "AED")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !isBalanced}>
          {isPending ? "Creating..." : "Create Journal Entry"}
        </Button>
      </div>
    </form>
  );
}


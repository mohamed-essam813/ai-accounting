"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  createJournalEntryAction,
  updateJournalEntryAction,
} from "@/lib/actions/journals";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { JournalTemplate } from "@/lib/data/journals";

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

type EditEntry = {
  id: string;
  date: string;
  description: string;
  journal_lines: Array<{
    account_id: string;
    debit: number;
    credit: number;
    memo?: string | null;
  }>;
};

type Props = {
  accounts: Account[];
  editEntry?: EditEntry | null;
  cancelHref?: string;
  templates?: JournalTemplate[];
};

function getDefaultFormValues(): FormValues {
  return {
    date: new Date().toISOString().slice(0, 10),
    description: "",
    lines: [
      { account_id: "", debit: 0, credit: 0, memo: "" },
      { account_id: "", debit: 0, credit: 0, memo: "" },
    ],
  };
}

export function JournalEntryForm({
  accounts,
  editEntry,
  cancelHref = "/journals",
  templates = [],
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState<string>("none");
  const [templateWarning, setTemplateWarning] = useState<string | null>(null);
  const isEdit = !!editEntry;

  const form = useForm<FormValues>({
    resolver: zodResolver(JournalEntryFormSchema),
    defaultValues: isEdit
      ? {
          date: editEntry!.date,
          description: editEntry!.description,
          lines: editEntry!.journal_lines.map((l) => ({
            account_id: l.account_id,
            debit: Number(l.debit),
            credit: Number(l.credit),
            memo: l.memo ?? "",
          })),
        }
      : getDefaultFormValues(),
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  // Build templates list from database
  const templateOptions = [
    { id: "none", name: "None" },
    ...templates.map((t) => ({ id: t.id, name: t.name })),
  ];

  // Apply template with account auto-selection
  const applyTemplate = (selectedTemplateId: string) => {
    setTemplateId(selectedTemplateId);
    setTemplateWarning(null);

    if (selectedTemplateId === "none") {
      form.setValue("description", "");
      replace([
        { account_id: "", debit: 0, credit: 0, memo: "" },
        { account_id: "", debit: 0, credit: 0, memo: "" },
      ]);
      return;
    }

    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    // Set description
    form.setValue("description", template.description_default || "");

    // Build lines from template
    const templateLines = template.lines.map((line, index) => {
      // Find account by ID first, then by code
      let accountId = "";
      if (line.default_account_id) {
        const accountById = accounts.find((a) => a.id === line.default_account_id);
        if (accountById) {
          accountId = accountById.id;
        } else if (line.default_account_code) {
          // Fallback to code lookup
          const accountByCode = accounts.find((a) => a.code === line.default_account_code);
          if (accountByCode) {
            accountId = accountByCode.id;
          }
        }
      } else if (line.default_account_code) {
        const accountByCode = accounts.find((a) => a.code === line.default_account_code);
        if (accountByCode) {
          accountId = accountByCode.id;
        }
      }

      // Set debit/credit based on side
      const debit = line.side === "debit" ? 0 : 0;
      const credit = line.side === "credit" ? 0 : 0;

      return {
        account_id: accountId,
        debit,
        credit,
        memo: line.default_memo || "",
      };
    });

    // Check for missing accounts
    const missingAccounts = template.lines
      .map((line, idx) => {
        if (!templateLines[idx].account_id && (line.default_account_id || line.default_account_code)) {
          return line.default_account_code || "unknown";
        }
        return null;
      })
      .filter((code): code is string => code !== null);

    if (missingAccounts.length > 0) {
      setTemplateWarning(
        `Template account(s) not found: ${missingAccounts.join(", ")}. Please select accounts manually or remap this template.`
      );
    }

    // Ensure at least 2 lines
    while (templateLines.length < 2) {
      templateLines.push({ account_id: "", debit: 0, credit: 0, memo: "" });
    }

    replace(templateLines);
  };

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
        if (isEdit && editEntry) {
          await updateJournalEntryAction({
            entryId: editEntry.id,
            date: values.date,
            description: values.description,
            lines: values.lines.map((line) => ({
              account_id: line.account_id,
              debit: Number(line.debit),
              credit: Number(line.credit),
              memo: line.memo || null,
            })),
          });
          toast.success("Draft updated.");
          router.push(cancelHref);
          router.refresh();
        } else {
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
          toast.success("Saved as draft. An approver can post it.");
          setTemplateId("none");
          setTemplateWarning(null);
          form.reset(getDefaultFormValues());
          router.refresh();
        }
      } catch (error) {
        console.error(error);
        toast.error(
          isEdit ? "Failed to update journal entry" : "Failed to create journal entry",
          { description: error instanceof Error ? error.message : undefined },
        );
      }
    });
  };

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      {!isEdit && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Template</label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Use a template (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {templateOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Prefill description, accounts, and line structure. Enter amounts.
              </p>
            </div>
          </div>
          {templateWarning && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{templateWarning}</AlertDescription>
            </Alert>
          )}
        </div>
      )}
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

      <div className="flex justify-end gap-2">
        {isEdit && (
          <Button type="button" variant="outline" asChild>
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        )}
        <Button type="submit" disabled={isPending || !isBalanced}>
          {isPending
            ? isEdit
              ? "Updating…"
              : "Creating…"
            : isEdit
              ? "Update draft"
              : "Create Journal Entry"}
        </Button>
      </div>
    </form>
  );
}


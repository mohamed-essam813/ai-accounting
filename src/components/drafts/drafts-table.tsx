"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { approveDraftAction, postDraftAction, updateDraftAction } from "@/lib/actions/drafts";
import { PromptIntentEnum } from "@/lib/ai/schema";
import { toast } from "sonner";
import { JournalPreview } from "./journal-preview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DraftTableItem = {
  id: string;
  intent: string;
  status: string;
  confidence: number | null;
  created_at: string;
  entities: {
    amount?: number;
    currency?: string;
    counterparty?: string | null;
    description?: string | null;
    date?: string;
    due_date?: string | null;
    invoice_number?: string | null;
    tax?: {
      rate?: number | null;
      amount?: number | null;
    } | null;
  };
};

type DraftTableProps = {
  drafts: DraftTableItem[];
};

export function DraftsTable({ drafts }: DraftTableProps) {
  const [isPending, startTransition] = useTransition();
  const [editorDraft, setEditorDraft] = useState<DraftTableItem | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const handleOpenEditor = (draft: DraftTableItem) => {
    setEditorDraft(draft);
    setIsEditorOpen(true);
  };

  const handleEditorChange = (open: boolean) => {
    setIsEditorOpen(open);
    if (!open) {
      setEditorDraft(null);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Intent</TableHead>
              <TableHead>Counterparty</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-64 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  No drafts yet. Generate one via the prompt workspace.
                </TableCell>
              </TableRow>
            ) : (
              drafts.map((draft) => (
                <TableRow key={draft.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(draft.created_at)}
                  </TableCell>
                  <TableCell className="capitalize">{draft.intent.replaceAll("_", " ")}</TableCell>
                  <TableCell>{draft.entities.counterparty ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {draft.entities.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(draft.entities.amount ?? 0, draft.entities.currency ?? "AED")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        draft.status === "posted"
                          ? "default"
                          : draft.status === "approved"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {draft.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={draft.status !== "draft" || isPending}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await approveDraftAction({ draftId: draft.id });
                            toast.success("Draft approved");
                          } catch (error) {
                            console.error(error);
                            toast.error("Failed to approve draft", {
                              description:
                                error instanceof Error ? error.message : "Unknown error occurred.",
                            });
                          }
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleOpenEditor(draft)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      disabled={draft.status === "posted" || draft.status === "draft" || isPending}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await postDraftAction({ draftId: draft.id });
                            toast.success("Journal entry posted");
                          } catch (error) {
                            console.error(error);
                            toast.error("Failed to post journal entry", {
                              description:
                                error instanceof Error ? error.message : "Unknown error occurred.",
                            });
                          }
                        })
                      }
                    >
                      Post Entry
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DraftEditorDialog draft={editorDraft} open={isEditorOpen} onOpenChange={handleEditorChange} />
    </>
  );
}

type DraftEditorDialogProps = {
  draft: DraftTableItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DraftIntentOptions = PromptIntentEnum.options;

const DraftEditFormSchema = z
  .object({
    intent: z.enum(DraftIntentOptions),
    amount: z.number().positive("Amount must be greater than zero"),
    currency: z.string().min(1, "Currency code is required"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format for transaction date"),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format for due date")
      .optional()
      .or(z.literal(""))
      .or(z.null()),
    counterparty: z.string().optional(),
    invoice_number: z.string().optional(),
    description: z.string().optional(),
    tax_rate: z.string().optional(),
    tax_amount: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.tax_rate && Number.isNaN(Number(values.tax_rate))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tax_rate"],
        message: "Enter a valid number",
      });
    }
    if (values.tax_amount && Number.isNaN(Number(values.tax_amount))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tax_amount"],
        message: "Enter a valid number",
      });
    }
  });

type DraftEditFormValues = z.infer<typeof DraftEditFormSchema>;

function getDefaultValues(draft: DraftTableItem): DraftEditFormValues {
  return {
    intent: (draft.intent as DraftEditFormValues["intent"]) ?? "create_invoice",
    amount: typeof draft.entities.amount === "number" ? draft.entities.amount : 0,
    currency: typeof draft.entities.currency === "string" ? draft.entities.currency : "AED",
    date: typeof draft.entities.date === "string" ? draft.entities.date : new Date().toISOString().slice(0, 10),
    due_date: typeof draft.entities.due_date === "string" ? draft.entities.due_date : "",
    counterparty: typeof draft.entities.counterparty === "string" ? draft.entities.counterparty : "",
    invoice_number: typeof draft.entities.invoice_number === "string" ? draft.entities.invoice_number : "",
    description: typeof draft.entities.description === "string" ? draft.entities.description : "",
    tax_rate:
      draft.entities.tax && typeof draft.entities.tax.rate === "number"
        ? String(draft.entities.tax.rate)
        : "",
    tax_amount:
      draft.entities.tax && typeof draft.entities.tax.amount === "number"
        ? String(draft.entities.tax.amount)
        : "",
  };
}

function DraftEditorDialog({ draft, open, onOpenChange }: DraftEditorDialogProps) {
  const [isSaving, startTransition] = useTransition();
  const defaultValues = useMemo(() => (draft ? getDefaultValues(draft) : undefined), [draft]);
  const form = useForm<DraftEditFormValues>({
    resolver: zodResolver(DraftEditFormSchema),
    defaultValues,
  });

  const intentValue = useWatch({ control: form.control, name: "intent" });

  useEffect(() => {
    if (draft) {
      form.reset(getDefaultValues(draft));
    }
  }, [draft, form]);

  const onSubmit = (values: DraftEditFormValues) => {
    if (!draft) return;

    startTransition(async () => {
      try {
        const taxRate = values.tax_rate ? Number(values.tax_rate) : undefined;
        const taxAmount = values.tax_amount ? Number(values.tax_amount) : undefined;

        await updateDraftAction({
          draftId: draft.id,
          intent: values.intent,
          confidence: draft.confidence ?? 0.8, // Keep existing confidence, don't expose to user
          entities: {
            amount: values.amount,
            currency: values.currency,
            date: values.date,
            counterparty: values.counterparty ? values.counterparty : null,
            description: values.description ? values.description : null,
            due_date: values.due_date ? values.due_date : null,
            invoice_number: values.invoice_number ? values.invoice_number : null,
            tax:
              taxRate !== undefined || taxAmount !== undefined
                ? {
                    rate: taxRate ?? 0,
                    amount: taxAmount ?? null,
                  }
                : null,
          },
        });

        toast.success("Draft updated", {
          description:
            draft.status === "approved"
              ? "Draft returned to pending approval because edits were made."
              : undefined,
        });
        onOpenChange(false);
      } catch (error) {
        console.error(error);
        toast.error("Failed to update draft", {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Draft</DialogTitle>
          <DialogDescription>
            Adjust AI-generated data before approving or posting the entry.
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <Tabs defaultValue="edit" className="space-y-4">
            <TabsList>
              <TabsTrigger value="edit">Edit Details</TabsTrigger>
              <TabsTrigger value="preview">Journal Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="preview">
              <JournalPreview draftId={draft.id} />
            </TabsContent>
            <TabsContent value="edit">
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Intent</label>
                <Select
                  value={intentValue}
                  onValueChange={(value) =>
                    form.setValue("intent", value as DraftEditFormValues["intent"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select intent" />
                  </SelectTrigger>
                  <SelectContent>
                    {DraftIntentOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Confidence field removed - internal metric not shown to users */}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input type="number" step="0.01" min="0" {...form.register("amount")} />
                {form.formState.errors.amount ? (
                  <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <Input {...form.register("currency")} />
                {form.formState.errors.currency ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.currency.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Transaction Date</label>
                <Input type="date" {...form.register("date")} />
                {form.formState.errors.date ? (
                  <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Due Date</label>
                <Input type="date" {...form.register("due_date")} />
                {form.formState.errors.due_date ? (
                  <p className="text-xs text-destructive">{form.formState.errors.due_date.message}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Counterparty</label>
                <Input {...form.register("counterparty")} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Invoice Number</label>
                <Input 
                  {...form.register("invoice_number")} 
                  disabled={intentValue === "create_invoice"}
                  className={intentValue === "create_invoice" ? "bg-muted cursor-not-allowed" : ""}
                />
                {intentValue === "create_invoice" && (
                  <p className="text-xs text-muted-foreground">
                    Invoice numbers are auto-generated and cannot be edited
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea rows={3} {...form.register("description")} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tax Rate (%)</label>
                <Input type="number" step="0.01" {...form.register("tax_rate")} />
                {form.formState.errors.tax_rate ? (
                  <p className="text-xs text-destructive">{form.formState.errors.tax_rate.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tax Amount</label>
                <Input type="number" step="0.01" {...form.register("tax_amount")} />
                {form.formState.errors.tax_amount ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.tax_amount.message}
                  </p>
                ) : null}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}


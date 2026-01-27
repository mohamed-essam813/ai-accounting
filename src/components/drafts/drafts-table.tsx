"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePagination } from "@/hooks/use-pagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
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
import { approveDraftAction, postDraftAction, updateDraftAction, deleteDraftAction, convertPostedToDraftAction } from "@/lib/actions/drafts";
import { PromptIntentEnum } from "@/lib/ai/schema";
import { toast } from "sonner";
import { JournalPreview } from "./journal-preview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Database } from "@/lib/database.types";
import { listTaxRatesAction, type TaxRate } from "@/lib/actions/tax-rates";
import { canApprove, canEditPosted, type UserRole } from "@/lib/auth";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Lock, Trash2, RotateCcw } from "lucide-react";

// Account type - new fields are optional since they may not be in database types yet
type Account = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

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
  accounts?: Account[];
  userRole?: string | null;
  displayCurrency?: string; // Currency to display amounts in
};

export function DraftsTable({ drafts, accounts = [], userRole, displayCurrency }: DraftTableProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [editorDraft, setEditorDraft] = useState<DraftTableItem | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState<DraftTableItem | null>(null);
  const [draftToConvert, setDraftToConvert] = useState<DraftTableItem | null>(null);
  const [convertReason, setConvertReason] = useState("");
  const [localDrafts, setLocalDrafts] = useState<DraftTableItem[]>(drafts);

  // Update local drafts when props change
  useEffect(() => {
    setLocalDrafts(drafts);
  }, [drafts]);

  const canDelete = (d: DraftTableItem) => d.status !== "posted" && canApprove(userRole as UserRole);
  const canConvertToDraft = (d: DraftTableItem) =>
    d.status === "posted" && canEditPosted(userRole as UserRole);

  // React Query mutations for real-time updates
  const approveMutation = useMutation({
    mutationFn: approveDraftAction,
    onSuccess: (data) => {
      // Update local state immediately
      setLocalDrafts((prev) =>
        prev.map((d) =>
          d.id === data.id
            ? { ...d, status: data.status, approved_by: data.approved_by, approved_at: data.approved_at }
            : d
        )
      );
      toast.success("Draft approved");
      // Invalidate queries to refetch from server
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      router.refresh();
    },
    onError: (error) => {
      console.error(error);
      toast.error("Failed to approve draft", {
        description: error instanceof Error ? error.message : "Unknown error occurred.",
      });
    },
  });

  const postMutation = useMutation({
    mutationFn: postDraftAction,
    onSuccess: (data, variables) => {
      // Update local state immediately - data is object with id, status, posted_entry_id
      if (typeof data === "object" && "id" in data) {
        setLocalDrafts((prev) =>
          prev.map((d) =>
            d.id === data.id
              ? { ...d, status: data.status, posted_entry_id: data.posted_entry_id }
              : d
          )
        );
      } else {
        // Fallback: if data is string (entry.id), update by finding the draft
        setLocalDrafts((prev) =>
          prev.map((d) => (d.id === variables.draftId ? { ...d, status: "posted" } : d))
        );
      }
      toast.success("Journal entry posted");
      // Invalidate queries to refetch from server
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      router.refresh();
    },
    onError: (error) => {
      console.error(error);
      toast.error("Failed to post journal entry", {
        description: error instanceof Error ? error.message : "Unknown error occurred.",
      });
    },
  });

  // Pagination - use localDrafts for real-time updates
  const {
    currentItems: paginatedDrafts,
    currentPage,
    totalPages,
    goToPage,
    itemsPerPage,
    setItemsPerPage,
  } = usePagination({ data: localDrafts, itemsPerPage: 20 });

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
              <TableHead className="min-w-[280px] w-72 text-right">Actions</TableHead>
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
              paginatedDrafts.map((draft) => (
                <TableRow 
                  key={draft.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={(e) => {
                    // Don't open editor if clicking on action buttons
                    const target = e.target as HTMLElement;
                    if (target.closest('button') || target.closest('a')) {
                      return;
                    }
                    // Check if user can edit this draft
                    if (draft.status === "posted" && (!userRole || !canEditPosted(userRole as UserRole))) {
                      return; // Don't open if posted and user can't edit
                    }
                    handleOpenEditor(draft);
                  }}
                >
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(draft.created_at)}
                  </TableCell>
                  <TableCell className="capitalize">{draft.intent.replaceAll("_", " ")}</TableCell>
                  <TableCell>{draft.entities.counterparty ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {draft.entities.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(
                      draft.entities.amount ?? 0,
                      (displayCurrency && displayCurrency !== "all" ? displayCurrency : draft.entities.currency) || "AED"
                    )}
                    {(draft.entities as any)?._converted && (
                      <span className="text-xs text-muted-foreground ml-1" title={`Converted from ${(draft.entities as any)._originalCurrency}`}>
                        *
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
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
                      {draft.status === "posted" && (
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Lock className="h-4 w-4 text-muted-foreground" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              Posted entries are locked. Create an adjustment or unpost (Admin only).
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                  <TableCell 
                    className="flex flex-nowrap items-center justify-end gap-2"
                    onClick={(e) => e.stopPropagation()} // Prevent row click when clicking actions
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={draft.status !== "draft" || approveMutation.isPending}
                      onClick={() => {
                        approveMutation.mutate({ draftId: draft.id });
                      }}
                    >
                      {approveMutation.isPending ? "Approving…" : "Approve"}
                    </Button>
                    {draft.status === "posted" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="shrink-0"
                        onClick={() => handleOpenEditor(draft)}
                        title="View (read-only). Unpost first to edit."
                      >
                        View
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="shrink-0"
                        onClick={() => handleOpenEditor(draft)}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="shrink-0"
                      disabled={draft.status === "posted" || draft.status === "draft" || postMutation.isPending}
                      onClick={() => {
                        postMutation.mutate({ draftId: draft.id });
                      }}
                    >
                      {postMutation.isPending ? "Posting…" : "Post Entry"}
                    </Button>
                    {canConvertToDraft(draft) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={isPending}
                        title="Convert to draft (void journal entry); admin/auditor only"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDraftToConvert(draft);
                        }}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Convert to Draft
                      </Button>
                    )}
                    {canDelete(draft) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={isPending}
                        title="Delete draft"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDraftToDelete(draft);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {drafts.length > 0 && (
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={drafts.length}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      )}

      <DraftEditorDialog
        draft={editorDraft}
        open={isEditorOpen}
        onOpenChange={handleEditorChange}
        accounts={accounts}
        readOnly={editorDraft?.status === "posted"}
      />

      <Dialog open={!!draftToDelete} onOpenChange={(open) => !open && setDraftToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete draft</DialogTitle>
            <DialogDescription>
              This draft will be permanently deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraftToDelete(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                if (!draftToDelete) return;
                startTransition(async () => {
                  try {
                    await deleteDraftAction({ draftId: draftToDelete.id });
                    toast.success("Draft deleted");
                    setDraftToDelete(null);
                    router.refresh();
                  } catch (error) {
                    console.error(error);
                    toast.error("Failed to delete draft", {
                      description: error instanceof Error ? error.message : "Unknown error occurred.",
                    });
                  }
                });
              }}
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!draftToConvert}
        onOpenChange={(open) => {
          if (!open) {
            setDraftToConvert(null);
            setConvertReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to draft (unpost)</DialogTitle>
            <DialogDescription>
              This draft is posted. The journal entry will be voided (excluded from reports and
              calculations) and the draft reverted to draft status. You can then edit or delete it.
              A reason is required for audit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="convert-reason" className="text-sm font-medium">
              Reason for unposting *
            </label>
            <Textarea
              id="convert-reason"
              placeholder="e.g. Correction required; duplicate entry"
              value={convertReason}
              onChange={(e) => setConvertReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDraftToConvert(null);
                setConvertReason("");
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={isPending || !convertReason.trim()}
              onClick={() => {
                if (!draftToConvert || !convertReason.trim()) return;
                startTransition(async () => {
                  try {
                    await convertPostedToDraftAction({
                      draftId: draftToConvert.id,
                      reason: convertReason.trim(),
                    });
                    toast.success("Draft converted to draft");
                    setDraftToConvert(null);
                    setConvertReason("");
                    router.refresh();
                  } catch (error) {
                    console.error(error);
                    toast.error("Failed to convert to draft", {
                      description: error instanceof Error ? error.message : "Unknown error occurred.",
                    });
                  }
                });
              }}
            >
              {isPending ? "Converting…" : "Convert to Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type DraftEditorDialogProps = {
  draft: DraftTableItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts?: Account[];
  readOnly?: boolean;
};

const DraftIntentOptions = PromptIntentEnum.options;

const DraftEditFormSchema = z
  .object({
    intent: z.enum(DraftIntentOptions),
    amount: z
      .union([z.number(), z.string()])
      .transform((val) => {
        if (typeof val === "string") {
          const parsed = parseFloat(val);
          if (isNaN(parsed)) throw new Error("Amount must be a valid number");
          return parsed;
        }
        return val;
      })
      .pipe(z.number().positive("Amount must be greater than zero")),
    currency: z.string().min(1, "Currency code is required"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format for transaction date")
      .refine((dateStr) => {
        const date = new Date(dateStr);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today
        return date <= today;
      }, "Transaction date cannot be in the future"),
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
    tax_treatment: z.enum(["exclusive", "inclusive"]).optional(),
  })
  .superRefine((values, ctx) => {
    // Validate due_date is not before transaction_date
    if (values.due_date && values.due_date !== "" && values.due_date !== null && values.date) {
      const transactionDate = new Date(values.date);
      const dueDate = new Date(values.due_date);
      if (dueDate < transactionDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["due_date"],
          message: "Due date cannot be earlier than transaction date",
        });
      }
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
  // Ensure date is valid - use today if invalid
  let defaultDate = new Date().toISOString().slice(0, 10);
  if (typeof draft.entities.date === "string") {
    const dateStr = draft.entities.date;
    // Validate date format and ensure it's not epoch (1970-01-01) or far past (before 2000)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const date = new Date(dateStr);
      const minDate = new Date("2000-01-01");
      if (date >= minDate && date <= new Date()) {
        defaultDate = dateStr;
      }
    }
  }

  const tax = draft.entities.tax as { rate?: number; amount?: number; tax_rate_id?: string } | undefined;
  // Get tax_treatment from draft (default to exclusive)
  const draftWithTaxTreatment = draft as DraftTableItem & { tax_treatment?: "exclusive" | "inclusive" | null };
  return {
    intent: (draft.intent as DraftEditFormValues["intent"]) ?? "create_invoice",
    amount: typeof draft.entities.amount === "number" ? draft.entities.amount : 0,
    currency: typeof draft.entities.currency === "string" ? draft.entities.currency : "AED",
    date: defaultDate,
    due_date: typeof draft.entities.due_date === "string" ? draft.entities.due_date : "",
    counterparty: typeof draft.entities.counterparty === "string" ? draft.entities.counterparty : "",
    invoice_number: typeof draft.entities.invoice_number === "string" ? draft.entities.invoice_number : "",
    description: typeof draft.entities.description === "string" ? draft.entities.description : "",
    tax_rate: tax?.tax_rate_id ?? "",
    tax_amount:
      tax && typeof tax.amount === "number" ? String(tax.amount) : "",
    tax_treatment: (draftWithTaxTreatment.tax_treatment as "exclusive" | "inclusive") ?? "exclusive",
  };
}

function DraftEditorDialog({ draft, open, onOpenChange, accounts = [], readOnly = false }: DraftEditorDialogProps) {
  const [isSaving, startTransition] = useTransition();
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);

  const defaultValues = useMemo(() => (draft ? getDefaultValues(draft) : undefined), [draft]);
  const form = useForm<DraftEditFormValues>({
    resolver: zodResolver(DraftEditFormSchema) as any,
    defaultValues,
  });

  const intentValue = useWatch({ control: form.control, name: "intent" });
  const amountValue = useWatch({ control: form.control, name: "amount" });
  const taxRateValue = useWatch({ control: form.control, name: "tax_rate" });
  const taxTreatmentValue = useWatch({ control: form.control, name: "tax_treatment" }) ?? "exclusive";

  // Load tax rates
  useEffect(() => {
    if (open) {
      listTaxRatesAction()
        .then((rates) => setTaxRates(rates))
        .catch((error) => {
          console.error("Failed to load tax rates:", error);
        });
    }
  }, [open]);

  // Auto-calculate tax amount based on tax treatment (exclusive/inclusive)
  useEffect(() => {
    if (taxRateValue && taxRateValue !== "none" && amountValue > 0) {
      const selectedRate = taxRates.find((rate) => rate.id === taxRateValue);
      if (selectedRate) {
        const rate = selectedRate.percentage / 100;
        let calculatedTax: number;
        let calculatedSubtotal: number;
        
        if (taxTreatmentValue === "inclusive") {
          // Inclusive: Total = amount, Subtotal = Total / (1 + rate), Tax = Total - Subtotal
          calculatedSubtotal = amountValue / (1 + rate);
          calculatedTax = amountValue - calculatedSubtotal;
        } else {
          // Exclusive: Subtotal = amount, Tax = Subtotal × rate, Total = Subtotal + Tax
          calculatedSubtotal = amountValue;
          calculatedTax = calculatedSubtotal * rate;
        }
        
        form.setValue("tax_amount", calculatedTax.toFixed(2));
      }
    }
  }, [taxRateValue, amountValue, taxRates, taxTreatmentValue, form]);

  useEffect(() => {
    if (draft) {
      form.reset(getDefaultValues(draft));
    }
  }, [draft, form]);

  // Hydrate legacy drafts: tax.rate but no tax_rate_id → match by percentage and set selector
  useEffect(() => {
    if (!draft || taxRates.length === 0 || !open) return;
    const tax = draft.entities.tax as { rate?: number; amount?: number; tax_rate_id?: string } | undefined;
    if (tax?.rate != null && !tax.tax_rate_id) {
      const match = taxRates.find((r) => Math.abs(r.percentage - tax.rate!) < 0.01);
      if (match) {
        form.setValue("tax_rate", match.id);
        const amt = typeof draft.entities.amount === "number" ? draft.entities.amount : 0;
        const amount = tax.amount != null ? String(tax.amount) : ((amt * match.percentage) / 100).toFixed(2);
        form.setValue("tax_amount", amount);
      }
    }
  }, [draft, taxRates, open, form]);

  const onSubmit = (values: DraftEditFormValues) => {
    if (!draft) return;

    startTransition(async () => {
      try {
        const selectedRate = values.tax_rate
          ? taxRates.find((rate) => rate.id === values.tax_rate)
          : undefined;
        const taxRatePercentage = selectedRate?.percentage;
        const taxAmount = values.tax_amount ? Number(values.tax_amount) : undefined;
        const taxTreatment = values.tax_treatment ?? "exclusive";

        await updateDraftAction({
          draftId: draft.id,
          intent: values.intent,
          confidence: draft.confidence ?? 0.8,
          tax_treatment: taxTreatment,
          entities: {
            amount: values.amount,
            currency: values.currency,
            date: values.date,
            counterparty: values.counterparty ? values.counterparty : null,
            description: values.description ? values.description : null,
            due_date: values.due_date ? values.due_date : null,
            invoice_number: values.invoice_number ? values.invoice_number : null,
            tax:
              taxRatePercentage !== undefined || taxAmount !== undefined
                ? ({
                    rate: taxRatePercentage ?? 0,
                    amount: taxAmount ?? null,
                    tax_rate_id: selectedRate?.id ?? null,
                  } as { rate: number; amount: number | null })
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
          <DialogTitle>{readOnly ? "View Draft" : "Edit Draft"}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? "Posted entries are read-only. Convert to draft first to edit."
              : "Adjust AI-generated data before approving or posting the entry."}
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <Tabs defaultValue="edit" className="space-y-4">
            <TabsList>
              <TabsTrigger value="edit">Edit Details</TabsTrigger>
              <TabsTrigger value="preview">Journal Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="preview">
              <JournalPreview draftId={draft.id} accounts={accounts} />
            </TabsContent>
            <TabsContent value="edit">
          <form className="space-y-4" onSubmit={readOnly ? (e) => e.preventDefault() : form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Intent</label>
                <Select
                  value={intentValue}
                  onValueChange={(value) =>
                    form.setValue("intent", value as DraftEditFormValues["intent"])
                  }
                  disabled={readOnly}
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
                <Input type="number" step="0.01" min="0" disabled={readOnly} {...form.register("amount")} />
                {form.formState.errors.amount ? (
                  <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <Input disabled={readOnly} {...form.register("currency")} />
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
                <Input type="date" disabled={readOnly} {...form.register("date")} />
                {form.formState.errors.date ? (
                  <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Due Date</label>
                <Input type="date" disabled={readOnly} {...form.register("due_date")} />
                {form.formState.errors.due_date ? (
                  <p className="text-xs text-destructive">{form.formState.errors.due_date.message}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Counterparty</label>
                <Input disabled={readOnly} {...form.register("counterparty")} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Invoice Number</label>
                <Input 
                  {...form.register("invoice_number")} 
                  disabled={readOnly || intentValue === "create_invoice"}
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
              <Textarea rows={3} disabled={readOnly} {...form.register("description")} />
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tax Rate</label>
                  <Select
                    value={taxRateValue || "none"}
                    onValueChange={(value) => {
                      form.setValue("tax_rate", value === "none" ? "" : value);
                    }}
                    disabled={readOnly}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tax rate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {taxRates.map((rate) => (
                        <SelectItem key={rate.id} value={rate.id}>
                          {rate.name} ({rate.percentage}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.tax_rate ? (
                    <p className="text-xs text-destructive">{form.formState.errors.tax_rate.message}</p>
                  ) : null}
                </div>
                {taxRateValue && taxRateValue !== "none" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tax Treatment</label>
                    <Select
                      value={taxTreatmentValue}
                      onValueChange={(value) => {
                        form.setValue("tax_treatment", value as "exclusive" | "inclusive");
                      }}
                      disabled={readOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exclusive">Exclusive of tax</SelectItem>
                        <SelectItem value="inclusive">Inclusive of tax</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {taxTreatmentValue === "exclusive"
                        ? "Tax will be added on top of amount"
                        : "Tax is included in amount"}
                    </p>
                  </div>
                ) : null}
              </div>
              {taxRateValue && taxRateValue !== "none" && amountValue > 0 && (
                <div className="rounded-md border p-4 space-y-2 bg-muted/50">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {taxTreatmentValue === "exclusive" ? "Subtotal" : "Total"}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(
                        taxTreatmentValue === "exclusive" ? amountValue : amountValue,
                        form.watch("currency") || "AED"
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-medium">
                      {formatCurrency(
                        Number(form.watch("tax_amount") || 0),
                        form.watch("currency") || "AED"
                      )}
                    </span>
                  </div>
                  {taxTreatmentValue === "inclusive" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">
                        {formatCurrency(
                          amountValue - Number(form.watch("tax_amount") || 0),
                          form.watch("currency") || "AED"
                        )}
                      </span>
                    </div>
                  )}
                  {taxTreatmentValue === "exclusive" && (
                    <div className="flex justify-between text-sm font-semibold border-t pt-2">
                      <span>Total</span>
                      <span>
                        {formatCurrency(
                          amountValue + Number(form.watch("tax_amount") || 0),
                          form.watch("currency") || "AED"
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Tax Amount</label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("tax_amount")}
                  readOnly
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-calculated from amount, tax rate, and tax treatment
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {readOnly ? "Close" : "Cancel"}
              </Button>
              {!readOnly && (
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </DialogFooter>
          </form>
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}


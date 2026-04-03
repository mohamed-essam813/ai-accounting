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
import { getErrorMessage } from "@/lib/utils";
import { isCounterpartyMismatchError } from "@/lib/drafts/counterparty-resolution";
import { parseBillPurchaseType } from "@/lib/drafts/single-line-bill-debit";
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
import { Label } from "@/components/ui/label";
import { AccountCombobox, type AccountOption } from "@/components/prompt/account-combobox";
import { SmartItemSelector } from "@/components/prompt/smart-item-selector";
import type { BusinessItem } from "@/lib/data/inventory";
import { getItemPickerByIdAction } from "@/lib/actions/items-picker";

// Account type - new fields are optional since they may not be in database types yet
type Account = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

type DraftTableItem = {
  id: string;
  intent: string;
  status: string;
  confidence: number | null;
  created_at: string;
  /** From contacts table when draft.contact_id is set — authoritative for display */
  counterparty_display_name?: string | null;
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
    bill_purchase_type?: "expense" | "inventory" | "asset";
    /** Mirrors bill_purchase_type; persisted for debugging / loaders */
    classification_type?: "EXPENSE" | "INVENTORY" | "ASSET";
    fixed_asset_draft?: {
      name?: string;
      category?: string;
      asset_account_id?: string;
      useful_life_years?: number;
      depreciation_method?: "straight_line";
    };
    selected_item_id?: string | null;
    ai_selected_accounts?: {
      debit_account?: { existing_account_id?: string };
    };
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
  const [postingDraftId, setPostingDraftId] = useState<string | null>(null);
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
        description: getErrorMessage(error, "Unknown error occurred."),
      });
    },
  });

  const applyPostSuccess = (data: { id: string; status: string; posted_entry_id?: string | null }, draftId: string) => {
    setLocalDrafts((prev) =>
      prev.map((d) =>
        d.id === draftId
          ? { ...d, status: data.status, posted_entry_id: data.posted_entry_id ?? null }
          : d
      ),
    );
    toast.success("Journal entry posted");
    queryClient.invalidateQueries({ queryKey: ["drafts"] });
    router.refresh();
  };

  const handlePostEntry = (draftId: string) => {
    startTransition(async () => {
      setPostingDraftId(draftId);
      try {
        const data = await postDraftAction({ draftId });
        if (typeof data === "object" && data !== null && "id" in data) {
          applyPostSuccess(data as { id: string; status: string; posted_entry_id?: string | null }, draftId);
        }
      } catch (error) {
        const msg = getErrorMessage(error, "");
        if (isCounterpartyMismatchError(msg)) {
          if (
            typeof window !== "undefined" &&
            window.confirm(
              "This differs from the name extracted from the uploaded document. Continue posting?",
            )
          ) {
            try {
              const data = await postDraftAction({
                draftId,
                acknowledgeCounterpartyDifference: true,
              });
              if (typeof data === "object" && data !== null && "id" in data) {
                applyPostSuccess(data as { id: string; status: string; posted_entry_id?: string | null }, draftId);
              }
            } catch (e2) {
              console.error(e2);
              toast.error("Failed to post journal entry", {
                description: getErrorMessage(e2, "Unknown error occurred."),
              });
            }
          }
        } else {
          console.error(error);
          toast.error("Failed to post journal entry", {
            description: getErrorMessage(error, "Unknown error occurred."),
          });
        }
      } finally {
        setPostingDraftId(null);
      }
    });
  };

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
                  <TableCell>
                    {draft.counterparty_display_name ?? draft.entities.counterparty ?? "—"}
                  </TableCell>
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
                      disabled={
                        draft.status === "posted" ||
                        draft.status === "draft" ||
                        postingDraftId === draft.id
                      }
                      onClick={() => handlePostEntry(draft.id)}
                    >
                      {postingDraftId === draft.id ? "Posting…" : "Post Entry"}
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
        onAccountsRefresh={() => router.refresh()}
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
                      description: getErrorMessage(error, "Unknown error occurred."),
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
                      description: getErrorMessage(error, "Unknown error occurred."),
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
  onAccountsRefresh?: () => void | Promise<void>;
};

const DraftIntentOptions = PromptIntentEnum.options;

const BillPurchaseTypeOptions = z.enum(["expense", "inventory", "asset"]);

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
    bill_purchase_type: BillPurchaseTypeOptions.optional(),
    expense_account_id: z.string().optional(),
    asset_name: z.string().optional(),
    asset_category: z.string().optional(),
    asset_account_id: z.string().optional(),
    useful_life_years: z
      .union([z.number(), z.string()])
      .optional()
      .transform((val) => {
        if (val === undefined || val === "") return undefined;
        if (typeof val === "number") return val;
        const n = parseInt(val, 10);
        return Number.isNaN(n) ? undefined : n;
      }),
    depreciation_method: z.enum(["straight_line"]).optional(),
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

    if (values.intent === "create_bill") {
      const pt = values.bill_purchase_type ?? "expense";
      if (pt === "expense" && !values.expense_account_id?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expense_account_id"],
          message: "Choose an expense category",
        });
      }
      if (pt === "asset") {
        if (!values.asset_name?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["asset_name"],
            message: "Enter an asset name",
          });
        }
        if (!values.asset_category?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["asset_category"],
            message: "Choose an asset category",
          });
        }
        if (!values.asset_account_id?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["asset_account_id"],
            message: "Choose a fixed asset account",
          });
        }
        const y = values.useful_life_years;
        if (y === undefined || y <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["useful_life_years"],
            message: "Enter useful life (years)",
          });
        }
      }
    }
  });

type DraftEditFormValues = z.infer<typeof DraftEditFormSchema>;

function findAccountOption(accounts: Account[], id: string | undefined): AccountOption | null {
  if (!id) return null;
  const a = accounts.find((x) => x.id === id);
  return a ? { id: a.id, name: a.name, code: a.code, type: a.type } : null;
}

function getDefaultValues(draft: DraftTableItem, accounts: Account[]): DraftEditFormValues {
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
  const draftWithTaxTreatment = draft as DraftTableItem & { tax_treatment?: "exclusive" | "inclusive" | null };
  const ent = draft.entities as DraftTableItem["entities"];
  const bpt = parseBillPurchaseType(ent as Record<string, unknown>);
  const debitId = ent.ai_selected_accounts?.debit_account?.existing_account_id;
  const fa = ent.fixed_asset_draft;
  let expense_account_id = "";
  let asset_account_id = "";
  if (bpt === "expense" && debitId) expense_account_id = debitId;
  if (bpt === "asset") {
    asset_account_id = fa?.asset_account_id ?? debitId ?? "";
  }

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
    bill_purchase_type: draft.intent === "create_bill" ? bpt : undefined,
    expense_account_id: draft.intent === "create_bill" ? expense_account_id : undefined,
    asset_name: fa?.name ?? "",
    asset_category: fa?.category ?? "Equipment",
    asset_account_id: draft.intent === "create_bill" ? asset_account_id : undefined,
    useful_life_years: fa?.useful_life_years ?? 3,
    depreciation_method: "straight_line",
  };
}

function DraftEditorDialog({
  draft,
  open,
  onOpenChange,
  accounts = [],
  readOnly = false,
  onAccountsRefresh,
}: DraftEditorDialogProps) {
  const [isSaving, startTransition] = useTransition();
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [expenseAccount, setExpenseAccount] = useState<AccountOption | null>(null);
  const [assetAccount, setAssetAccount] = useState<AccountOption | null>(null);
  const [lineItem, setLineItem] = useState<BusinessItem | null>(null);

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ id: a.id, name: a.name, code: a.code, type: a.type })),
    [accounts],
  );

  const defaultValues = useMemo(
    () => (draft ? getDefaultValues(draft, accounts) : undefined),
    [draft, accounts],
  );
  const form = useForm<DraftEditFormValues>({
    resolver: zodResolver(DraftEditFormSchema) as any,
    defaultValues,
  });

  const intentValue = useWatch({ control: form.control, name: "intent" });
  const amountValue = useWatch({ control: form.control, name: "amount" });
  const taxRateValue = useWatch({ control: form.control, name: "tax_rate" });
  const taxTreatmentValue = useWatch({ control: form.control, name: "tax_treatment" }) ?? "exclusive";
  const billPurchaseType = useWatch({ control: form.control, name: "bill_purchase_type" }) ?? "expense";

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
      const vals = getDefaultValues(draft, accounts);
      form.reset(vals);
      const ent = draft.entities as DraftTableItem["entities"];
      const bpt = parseBillPurchaseType(ent as Record<string, unknown>);
      const debitId = ent.ai_selected_accounts?.debit_account?.existing_account_id;
      if (bpt === "expense") {
        setExpenseAccount(findAccountOption(accounts, debitId));
        setAssetAccount(null);
      } else if (bpt === "asset") {
        const faId = ent.fixed_asset_draft?.asset_account_id ?? debitId;
        setAssetAccount(findAccountOption(accounts, faId));
        setExpenseAccount(null);
      } else {
        setExpenseAccount(null);
        setAssetAccount(null);
      }
      const sid = ent.selected_item_id;
      if (bpt === "inventory" && sid && typeof sid === "string") {
        getItemPickerByIdAction(sid)
          .then((item) => {
            if (item) setLineItem(item);
            else setLineItem(null);
          })
          .catch(() => setLineItem(null));
      } else {
        setLineItem(null);
      }
    }
  }, [draft, form, accounts]);

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

  useEffect(() => {
    if (intentValue === "create_bill" && !form.getValues("bill_purchase_type")) {
      form.setValue("bill_purchase_type", "expense");
    }
  }, [intentValue, form]);

  useEffect(() => {
    if (expenseAccount) form.setValue("expense_account_id", expenseAccount.id);
  }, [expenseAccount, form]);

  useEffect(() => {
    if (assetAccount) form.setValue("asset_account_id", assetAccount.id);
  }, [assetAccount, form]);

  const onSubmit = (values: DraftEditFormValues) => {
    if (!draft) return;

    const existingItemId = (draft.entities as { selected_item_id?: string | null }).selected_item_id;
    const inventoryItemId = lineItem?.id ?? existingItemId ?? null;
    if (values.intent === "create_bill" && values.bill_purchase_type === "inventory" && !inventoryItemId) {
      toast.error("Select an inventory-tracked product.");
      return;
    }

    startTransition(async () => {
      try {
        const selectedRate = values.tax_rate
          ? taxRates.find((rate) => rate.id === values.tax_rate)
          : undefined;
        const taxRatePercentage = selectedRate?.percentage;
        const taxAmount = values.tax_amount ? Number(values.tax_amount) : undefined;
        const taxTreatment = values.tax_treatment ?? "exclusive";

        const desc =
          values.intent === "create_bill" && values.bill_purchase_type === "asset"
            ? values.asset_name?.trim() || values.description || null
            : values.description
              ? values.description
              : null;

        await updateDraftAction({
          draftId: draft.id,
          intent: values.intent,
          confidence: draft.confidence ?? 0.8,
          tax_treatment: taxTreatment,
          ...(values.intent === "create_bill"
            ? {
                billPurchaseType: values.bill_purchase_type ?? "expense",
                expenseAccountId:
                  values.bill_purchase_type === "expense" ? values.expense_account_id : undefined,
                selectedItemId:
                  values.bill_purchase_type === "inventory" ? inventoryItemId : null,
                fixedAssetDraft:
                  values.bill_purchase_type === "asset"
                    ? {
                        name: values.asset_name?.trim() ?? "",
                        category: values.asset_category ?? "",
                        asset_account_id: values.asset_account_id ?? "",
                        useful_life_years: Number(values.useful_life_years) > 0 ? Number(values.useful_life_years) : 1,
                        depreciation_method: "straight_line" as const,
                      }
                    : undefined,
              }
            : {}),
          entities: {
            amount: values.amount,
            currency: values.currency,
            date: values.date,
            counterparty: values.counterparty ? values.counterparty : null,
            description: desc,
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
          description: getErrorMessage(error, "Unknown error occurred."),
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full min-w-0 max-w-[min(1100px,calc(100vw-2rem))] overflow-y-auto overflow-x-hidden sm:max-w-[min(1100px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>{readOnly ? "View Draft" : "Edit Draft"}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? "Posted entries are read-only. Convert to draft first to edit."
              : "Adjust AI-generated data before approving or posting the entry."}
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <Tabs defaultValue="edit" className="min-w-0 space-y-4">
            <TabsList>
              <TabsTrigger value="edit">Edit Details</TabsTrigger>
              <TabsTrigger value="preview">Journal Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="preview" className="min-w-0">
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

            {intentValue === "create_bill" ? (
              <div className="space-y-4 rounded-md border bg-muted/30 p-4">
                <div className="space-y-2">
                  <Label>What did you purchase?</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["expense", "inventory", "asset"] as const).map((id) => (
                      <Button
                        key={id}
                        type="button"
                        variant={billPurchaseType === id ? "default" : "secondary"}
                        size="sm"
                        disabled={readOnly}
                        onClick={() => {
                          form.setValue("bill_purchase_type", id);
                          if (id !== "expense") setExpenseAccount(null);
                          if (id !== "asset") setAssetAccount(null);
                          if (id !== "inventory") setLineItem(null);
                        }}
                      >
                        {id === "expense" ? "Expense" : id === "inventory" ? "Inventory" : "Asset"}
                      </Button>
                    ))}
                  </div>
                </div>
                {billPurchaseType === "expense" ? (
                  <div className="space-y-1">
                    <AccountCombobox
                      label="Expense category"
                      placeholder="Search expense accounts…"
                      value={expenseAccount}
                      onChange={setExpenseAccount}
                      accounts={accountOptions}
                      typeFilter={(t) => t === "expense"}
                      disabled={readOnly}
                      inlineCreateAccountType="expense"
                      onAccountsRefresh={onAccountsRefresh}
                    />
                    {form.formState.errors.expense_account_id ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.expense_account_id.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {billPurchaseType === "inventory" ? (
                  <SmartItemSelector
                    taxRates={taxRates}
                    value={lineItem}
                    onChange={setLineItem}
                    disabled={readOnly}
                  />
                ) : null}
                {billPurchaseType === "asset" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Asset name</Label>
                      <Input
                        {...form.register("asset_name")}
                        disabled={readOnly}
                        placeholder="e.g. MacBook Pro"
                      />
                      {form.formState.errors.asset_name ? (
                        <p className="text-xs text-destructive">
                          {form.formState.errors.asset_name.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label>Asset category</Label>
                      <Select
                        value={form.watch("asset_category") || "Equipment"}
                        onValueChange={(v) => form.setValue("asset_category", v)}
                        disabled={readOnly}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["Laptop", "Equipment", "Furniture", "Vehicle", "Other"].map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.asset_category ? (
                        <p className="text-xs text-destructive">
                          {form.formState.errors.asset_category.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <AccountCombobox
                        label="Fixed asset account"
                        placeholder="Search fixed asset accounts…"
                        value={assetAccount}
                        onChange={setAssetAccount}
                        accounts={accountOptions}
                        typeFilter={(t) => t === "asset"}
                        disabled={readOnly}
                        inlineCreateAccountType="asset"
                        onAccountsRefresh={onAccountsRefresh}
                      />
                      {form.formState.errors.asset_account_id ? (
                        <p className="text-xs text-destructive">
                          {form.formState.errors.asset_account_id.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label>Useful life (years)</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        {...form.register("useful_life_years")}
                        disabled={readOnly}
                      />
                      {form.formState.errors.useful_life_years ? (
                        <p className="text-xs text-destructive">
                          {form.formState.errors.useful_life_years.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label>Depreciation</Label>
                      <Select
                        value="straight_line"
                        onValueChange={() => form.setValue("depreciation_method", "straight_line")}
                        disabled={readOnly}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="straight_line">Straight-line</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

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
                <label className="text-sm font-medium">
                  {intentValue === "create_bill" ? "Bill Number" : "Invoice Number"}
                </label>
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


/**
 * Inline Draft Review Panel
 * Feedback: Show draft review immediately after creation without navigation
 */

"use client";

import { useState, useTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import Link from "next/link";
import { X, Check, XCircle, Edit2, FileText, AlertCircle, ExternalLink, Trash2, RotateCcw } from "lucide-react";
import { updateDraftAction, approveDraftAction, postDraftAction, deleteDraftAction, convertPostedToDraftAction } from "@/lib/actions/drafts";
import { listTaxRatesAction, type TaxRate } from "@/lib/actions/tax-rates";
import { canApprove, canPost, canEditPosted, type UserRole } from "@/lib/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import type { DraftPayload } from "@/lib/ai/schema";
import type { SourceDocument } from "@/lib/data/documents";
import type { InventoryItem } from "@/lib/data/inventory";
import { JournalPreview } from "@/components/drafts/journal-preview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InventoryItemPicker } from "./inventory-item-picker";
import type { Database } from "@/lib/database.types";

type Account = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

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

const DraftEditFormSchema = z
  .object({
    counterparty: z.string().optional(),
    date: z
      .string()
      .min(1, "Date is required")
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
      .refine((dateStr) => {
        const date = new Date(dateStr);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today
        return date <= today;
      }, "Transaction date cannot be in the future"),
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
      .pipe(z.number().min(0.01, "Amount must be greater than 0")),
    currency: z.string().min(1, "Currency is required"),
    tax_rate: z.string().optional(),
    tax_amount: z.string().optional(),
    description: z.string().optional(),
    due_date: z
      .string()
      .optional()
      .refine(
        (val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val),
        "Use YYYY-MM-DD format for due date"
      ),
    invoice_number: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    // Validate due_date is not before transaction_date
    if (values.due_date && values.due_date !== "" && values.date) {
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
  });

type DraftEditFormValues = z.infer<typeof DraftEditFormSchema>;

type DraftData = {
  id: string;
  intent: string;
  status: string;
  confidence: number | null;
  entities: DraftPayload["entities"];
  created_at: string;
};

type Props = {
  draftId: string;
  initialDraft: DraftData;
  documents: SourceDocument[];
  accounts: Account[];
  inventoryItems?: InventoryItem[];
  userRole: UserRole;
  onClose: () => void;
  onDraftUpdated?: () => void;
};

export function InlineDraftReviewPanel({
  draftId,
  initialDraft,
  documents,
  accounts,
  inventoryItems = [],
  userRole,
  onClose,
  onDraftUpdated,
}: Props) {
  const [draft, setDraft] = useState<DraftData>(initialDraft);
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, startProcessing] = useTransition();
  const [showPostConfirm, setShowPostConfirm] = useState(false);
  
  // Extract inventory line items from draft entities
  const getInitialInventoryItems = (): InventoryLineItem[] => {
    const entities = draft.entities as any;
    return entities.inventory_line_items || [];
  };
  
  const [inventoryLineItems, setInventoryLineItems] = useState<InventoryLineItem[]>(getInitialInventoryItems());

  // Ensure date is valid - use today if invalid
  const getValidDate = () => {
    if (typeof draft.entities.date === "string") {
      const dateStr = draft.entities.date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const date = new Date(dateStr);
        const minDate = new Date("2000-01-01");
        if (date >= minDate && date <= new Date()) {
          return dateStr;
        }
      }
    }
    return new Date().toISOString().slice(0, 10);
  };

  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const form = useForm<DraftEditFormValues>({
    resolver: zodResolver(DraftEditFormSchema) as any,
    defaultValues: {
      counterparty: draft.entities.counterparty ?? "",
      date: getValidDate(),
      amount: typeof draft.entities.amount === "number" ? draft.entities.amount : 0,
      currency: draft.entities.currency ?? "USD",
      tax_rate: (draft.entities.tax as { tax_rate_id?: string } | undefined)?.tax_rate_id ?? "",
      tax_amount: draft.entities.tax?.amount != null ? String(draft.entities.tax.amount) : "",
      description: draft.entities.description ?? "",
      due_date: draft.entities.due_date ?? "",
      invoice_number: draft.entities.invoice_number ?? "",
    },
  });

  useEffect(() => {
    listTaxRatesAction().then(setTaxRates).catch(() => {});
  }, []);

  const tax = draft.entities.tax as { rate?: number; amount?: number; tax_rate_id?: string } | undefined;
  useEffect(() => {
    if (taxRates.length === 0 || !tax?.rate || tax.tax_rate_id) return;
    const match = taxRates.find((r) => Math.abs(r.percentage - tax.rate!) < 0.01);
    if (match) {
      form.setValue("tax_rate", match.id);
      form.setValue("tax_amount", tax.amount != null ? String(tax.amount) : "");
    }
  }, [taxRates, tax?.rate, tax?.amount, tax?.tax_rate_id, form]);

  const taxRateValue = form.watch("tax_rate");
  const amountValue = form.watch("amount");
  useEffect(() => {
    if (taxRateValue && taxRateValue !== "none") {
      const r = taxRates.find((x) => x.id === taxRateValue);
      if (r && amountValue) {
        form.setValue("tax_amount", ((amountValue * r.percentage) / 100).toFixed(2));
      }
    }
  }, [taxRateValue, amountValue, taxRates, form]);

  // Refresh draft data
  useEffect(() => {
    const fetchDraft = async () => {
      try {
        const response = await fetch(`/api/drafts/${draftId}`);
        if (response.ok) {
          const data = await response.json();
          setDraft(data.draft);
          // Reload inventory line items from draft
          const entities = data.draft.entities as any;
          if (entities.inventory_line_items) {
            setInventoryLineItems(entities.inventory_line_items);
          }
        }
      } catch (error) {
        console.error("Failed to refresh draft:", error);
      }
    };

    fetchDraft();
  }, [draftId]);

  const canUserApprove = canApprove(userRole);
  const canUserPost = canPost(userRole);
  const canUserDelete = draft.status !== "posted" && canApprove(userRole);
  const canUserConvertToDraft = draft.status === "posted" && canEditPosted(userRole);
  const isLowConfidence = draft.confidence !== null && draft.confidence < 0.7;
  const hasMissingFields = !draft.entities.amount || !draft.entities.date || !draft.entities.currency;

  const intentLabels: Record<string, string> = {
    create_invoice: "Invoice",
    create_bill: "Bill",
    record_payment: "Payment",
    reconcile_bank: "Bank Reconciliation",
    create_credit_note: "Credit Note",
    create_debit_note: "Debit Note",
  };

  const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { label: "Draft", variant: "secondary" },
    approved: { label: "Approved", variant: "default" },
    posted: { label: "Posted", variant: "default" },
    rejected: { label: "Rejected", variant: "destructive" },
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = async (values: DraftEditFormValues) => {
    startProcessing(async () => {
      try {
        const selectedRate = values.tax_rate
          ? taxRates.find((r) => r.id === values.tax_rate)
          : undefined;
        const taxRatePct = selectedRate?.percentage;
        const taxAmount = values.tax_amount ? Number(values.tax_amount) : undefined;

        let finalAmount = values.amount;
        if (inventoryLineItems.length > 0) {
          finalAmount = inventoryLineItems.reduce((sum, item) => sum + item.total, 0);
        }

        await updateDraftAction({
          draftId: draft.id,
          intent: draft.intent as DraftPayload["intent"],
          confidence: draft.confidence ?? 0.8,
          entities: {
            amount: finalAmount,
            currency: values.currency,
            date: values.date,
            counterparty: values.counterparty || null,
            description: values.description || null,
            due_date: values.due_date || null,
            invoice_number: values.invoice_number || null,
            tax:
              taxRatePct !== undefined || taxAmount !== undefined
                ? {
                    rate: taxRatePct ?? 0,
                    amount: taxAmount ?? null,
                    tax_rate_id: selectedRate?.id ?? null,
                  }
                : null,
            inventory_line_items: inventoryLineItems.length > 0 ? inventoryLineItems : undefined,
          } as any,
        });

        toast.success("Draft updated");
        setIsEditing(false);
        onDraftUpdated?.();
      } catch (error) {
        console.error(error);
        toast.error("Failed to update draft", {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  const handleApprove = async () => {
    if (!canUserApprove) {
      toast.error("You do not have permission to approve drafts");
      return;
    }

    startProcessing(async () => {
      try {
        await approveDraftAction({ draftId: draft.id });
        toast.success("Draft approved");
        onDraftUpdated?.();
      } catch (error) {
        console.error(error);
        toast.error("Failed to approve draft", {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  const handleApproveAndPost = async () => {
    if (!canUserApprove || !canUserPost) {
      toast.error("You do not have permission to approve and post drafts");
      return;
    }

    if (!showPostConfirm) {
      setShowPostConfirm(true);
      return;
    }

    startProcessing(async () => {
      try {
        // First approve, then post
        await approveDraftAction({ draftId: draft.id });
        await postDraftAction({ draftId: draft.id });
        toast.success("Draft approved and posted");
        onDraftUpdated?.();
        onClose();
      } catch (error) {
        console.error(error);
        toast.error("Failed to post draft", {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  const handleReject = () => {
    onClose();
    toast.info("Draft review closed. You can manage it from Drafts & Approvals.");
  };

  const handleDelete = () => {
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
    startProcessing(async () => {
      try {
        await deleteDraftAction({ draftId: draft.id });
        toast.success("Draft deleted");
        onDraftUpdated?.();
        onClose();
      } catch (error) {
        console.error(error);
        toast.error("Failed to delete draft", {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  const handleConvertToDraft = () => {
    if (
      !window.confirm(
        "This draft is posted. The journal entry will be voided and the draft reverted to draft status. A reason is required for audit. Continue?"
      )
    )
      return;
    const reason = window.prompt("Reason for unposting (required):");
    if (!reason?.trim()) {
      toast.error("Reason is required for unposting.");
      return;
    }
    startProcessing(async () => {
      try {
        await convertPostedToDraftAction({ draftId: draft.id, reason: reason.trim() });
        toast.success("Draft converted to draft");
        onDraftUpdated?.();
        onClose();
      } catch (error) {
        console.error(error);
        toast.error("Failed to convert to draft", {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  const transactionSummary = `${intentLabels[draft.intent] || "Transaction"}${draft.entities.counterparty ? ` for ${draft.entities.counterparty}` : ""}${draft.entities.amount ? ` - ${formatCurrency(draft.entities.amount, draft.entities.currency || "USD")}` : ""}`;

  return (
    <Card className="flex flex-col max-h-[calc(100vh-8rem)]">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Draft Review</CardTitle>
            <CardDescription className="mt-1">
              Review and approve the generated draft
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isProcessing}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
          <div className="flex items-center gap-2">
            <Badge variant={statusLabels[draft.status]?.variant || "secondary"}>
              {statusLabels[draft.status]?.label || draft.status}
            </Badge>
            {isLowConfidence && (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                <AlertCircle className="h-3 w-3 mr-1" />
                Low Confidence
              </Badge>
            )}
          </div>
          <Link
            href="/drafts"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            View in Drafts & Approvals
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto">
        <Tabs defaultValue="details" className="space-y-4">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="journal">Journal Entry</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6 mt-4">
            {/* Transaction Summary */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Transaction Summary</h3>
              <p className="text-sm text-muted-foreground">{transactionSummary}</p>
            </div>

            <Separator />

        {/* Missing Fields Warning */}
        {hasMissingFields && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">Some details need review before posting.</p>
                <p className="text-xs text-amber-700 mt-1">
                  Please ensure all required fields are filled before approving.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Editable Fields */}
        {isEditing ? (
          <form onSubmit={form.handleSubmit(handleSaveEdit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Customer / Supplier</label>
                <Input {...form.register("counterparty")} placeholder="Enter name" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Date</label>
                <Input type="date" {...form.register("date")} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Amount</label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("amount", { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Currency</label>
                <Input {...form.register("currency")} placeholder="USD" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Tax Rate</label>
                <Select
                  value={form.watch("tax_rate") || "none"}
                  onValueChange={(v) => form.setValue("tax_rate", v === "none" ? "" : v)}
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
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Tax Amount</label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("tax_amount")}
                  readOnly={!!taxRateValue && taxRateValue !== "none"}
                  className={!!taxRateValue && taxRateValue !== "none" ? "bg-muted cursor-not-allowed" : ""}
                />
                {taxRateValue && taxRateValue !== "none" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Auto-calculated from amount and tax rate
                  </p>
                )}
              </div>
              {draft.intent === "create_invoice" && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Invoice Number</label>
                  <Input {...form.register("invoice_number")} />
                </div>
              )}
              {draft.entities.due_date && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Due Date</label>
                  <Input type="date" {...form.register("due_date")} />
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea {...form.register("description")} rows={3} />
            </div>
            
            {/* Inventory Item Picker for Invoices and Bills */}
            {(draft.intent === "create_invoice" || draft.intent === "create_bill") && inventoryItems.length > 0 && (
              <InventoryItemPicker
                items={inventoryItems}
                selectedItems={inventoryLineItems}
                onItemsChange={(items) => {
                  setInventoryLineItems(items);
                  // Auto-update amount field if inventory items are present
                  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
                  if (totalAmount > 0) {
                    form.setValue("amount", totalAmount);
                  }
                }}
                disabled={isProcessing}
              />
            )}
            
            <div className="flex gap-2">
              <Button type="submit" disabled={isProcessing} size="sm">
                Save Changes
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Customer / Supplier</label>
                <p className="text-sm mt-1">{draft.entities.counterparty || "—"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Date</label>
                <p className="text-sm mt-1">{draft.entities.date || "—"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Amount</label>
                <p className="text-sm mt-1">
                  {draft.entities.amount
                    ? formatCurrency(draft.entities.amount, draft.entities.currency || "USD")
                    : "—"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Tax</label>
                <p className="text-sm mt-1">
                  {draft.entities.tax
                    ? `${draft.entities.tax.rate}%${draft.entities.tax.amount ? ` (${formatCurrency(draft.entities.tax.amount, draft.entities.currency || "USD")})` : ""}`
                    : "—"}
                </p>
              </div>
              {draft.entities.invoice_number && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Invoice Number</label>
                  <p className="text-sm mt-1">{draft.entities.invoice_number}</p>
                </div>
              )}
              {draft.entities.due_date && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Due Date</label>
                  <p className="text-sm mt-1">{draft.entities.due_date}</p>
                </div>
              )}
            </div>
            {draft.entities.description && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Description</label>
                <p className="text-sm mt-1">{draft.entities.description}</p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleEdit} disabled={isProcessing}>
              <Edit2 className="h-3 w-3 mr-2" />
              Edit Draft
            </Button>
          </div>
        )}

            <Separator />

            {/* Attached Documents */}
            {documents.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Attached Documents</h3>
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 p-2 rounded-md border bg-muted/50"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">{doc.mime_type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Actions */}
            <div className="space-y-2">
          {draft.status === "draft" && (
            <>
              {canUserApprove && canUserPost && (
                <Button
                  onClick={handleApproveAndPost}
                  disabled={isProcessing || hasMissingFields}
                  className="w-full"
                  size="sm"
                >
                  {showPostConfirm ? (
                    <>
                      <Check className="h-3 w-3 mr-2" />
                      Confirm Approve & Post
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3 mr-2" />
                      Approve & Post
                    </>
                  )}
                </Button>
              )}
              {canUserApprove && (
                <Button
                  onClick={handleApprove}
                  disabled={isProcessing}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  <Check className="h-3 w-3 mr-2" />
                  Approve Only
                </Button>
              )}
            </>
          )}
          {draft.status === "approved" && canUserPost && (
            <Button
              onClick={handleApproveAndPost}
              disabled={isProcessing}
              className="w-full"
              size="sm"
            >
              <Check className="h-3 w-3 mr-2" />
              Post Entry
            </Button>
          )}
          {draft.status !== "posted" && (
            <Button
              onClick={handleReject}
              disabled={isProcessing}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <XCircle className="h-3 w-3 mr-2" />
              Close Panel
            </Button>
          )}
          {canUserConvertToDraft && (
            <Button
              onClick={handleConvertToDraft}
              disabled={isProcessing}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <RotateCcw className="h-3 w-3 mr-2" />
              Convert to Draft
            </Button>
          )}
          {canUserDelete && (
            <Button
              onClick={handleDelete}
              disabled={isProcessing}
              variant="outline"
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
              size="sm"
            >
              <Trash2 className="h-3 w-3 mr-2" />
              Delete Draft
            </Button>
          )}
          </div>
          </TabsContent>

          <TabsContent value="journal" className="mt-4">
            <JournalPreview draftId={draftId} editable={false} accounts={accounts} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}


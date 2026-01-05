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
import { X, Check, XCircle, Edit2, FileText, AlertCircle } from "lucide-react";
import { updateDraftAction, approveDraftAction, postDraftAction } from "@/lib/actions/drafts";
import { canApprove, canPost, type UserRole } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import type { DraftPayload } from "@/lib/ai/schema";
import type { SourceDocument } from "@/lib/data/documents";
import { JournalPreview } from "@/components/drafts/journal-preview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Database } from "@/lib/database.types";

type Account = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

const DraftEditFormSchema = z.object({
  counterparty: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  currency: z.string().min(1, "Currency is required"),
  tax_rate: z.string().optional(),
  tax_amount: z.string().optional(),
  description: z.string().optional(),
  due_date: z.string().optional(),
  invoice_number: z.string().optional(),
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
  userRole: UserRole;
  onClose: () => void;
  onDraftUpdated?: () => void;
};

export function InlineDraftReviewPanel({
  draftId,
  initialDraft,
  documents,
  accounts,
  userRole,
  onClose,
  onDraftUpdated,
}: Props) {
  const [draft, setDraft] = useState<DraftData>(initialDraft);
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, startProcessing] = useTransition();
  const [showPostConfirm, setShowPostConfirm] = useState(false);

  const form = useForm<DraftEditFormValues>({
    resolver: zodResolver(DraftEditFormSchema),
    defaultValues: {
      counterparty: draft.entities.counterparty ?? "",
      date: draft.entities.date ?? new Date().toISOString().slice(0, 10),
      amount: typeof draft.entities.amount === "number" ? draft.entities.amount : 0,
      currency: draft.entities.currency ?? "USD",
      tax_rate: draft.entities.tax?.rate ? String(draft.entities.tax.rate) : "",
      tax_amount: draft.entities.tax?.amount ? String(draft.entities.tax.amount) : "",
      description: draft.entities.description ?? "",
      due_date: draft.entities.due_date ?? "",
      invoice_number: draft.entities.invoice_number ?? "",
    },
  });

  // Refresh draft data
  useEffect(() => {
    const fetchDraft = async () => {
      try {
        const response = await fetch(`/api/drafts/${draftId}`);
        if (response.ok) {
          const data = await response.json();
          setDraft(data.draft);
        }
      } catch (error) {
        console.error("Failed to refresh draft:", error);
      }
    };

    fetchDraft();
  }, [draftId]);

  const canUserApprove = canApprove(userRole);
  const canUserPost = canPost(userRole);
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
        const taxRate = values.tax_rate ? Number(values.tax_rate) : undefined;
        const taxAmount = values.tax_amount ? Number(values.tax_amount) : undefined;

        await updateDraftAction({
          draftId: draft.id,
          intent: draft.intent as DraftPayload["intent"],
          confidence: draft.confidence ?? 0.8,
          entities: {
            amount: values.amount,
            currency: values.currency,
            date: values.date,
            counterparty: values.counterparty || null,
            description: values.description || null,
            due_date: values.due_date || null,
            invoice_number: values.invoice_number || null,
            tax:
              taxRate !== undefined || taxAmount !== undefined
                ? {
                    rate: taxRate ?? 0,
                    amount: taxAmount ?? null,
                  }
                : null,
          },
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
    // Reject just closes the panel - draft remains in system
    // User can manage it from Drafts & Approvals page
    onClose();
    toast.info("Draft review closed. You can manage it from Drafts & Approvals.");
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
        <div className="flex items-center gap-2 mt-4">
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
                <label className="text-sm font-medium mb-1 block">Tax Rate (%)</label>
                <Input type="number" step="0.01" {...form.register("tax_rate")} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Tax Amount</label>
                <Input type="number" step="0.01" {...form.register("tax_amount")} />
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


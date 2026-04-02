"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DraftSchema } from "@/lib/ai/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { listAccounts } from "@/lib/data/accounts";
import { listTaxRates } from "@/lib/data/tax-rates";
import { buildDefaultJournalLines, ensureBalanced, type IntentAccountMapping, type JournalLine, type Account } from "@/lib/accounting";
import { canApprove, canEditPosted, type UserRole } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import type { DraftPayload } from "@/lib/ai/schema";
import { getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import { assertPostingDateAllowed } from "@/lib/accounting/period-lock";
import { getErrorMessage } from "@/lib/utils";
import {
  buildDraftPostedTimelineDescription,
  draftIntentToTimelineEventType,
  recordTimelineEvent,
} from "@/lib/data/timeline";
import {
  materializeInvoiceOrBillFromPostedDraft,
  materializePaymentFromPostedDraft,
} from "@/lib/posting/materialize-documents";
import { annotateDraftPostingLines } from "@/lib/posting/journal-line-provenance";
import { buildTransactionAmounts, validateTransactionAmountsMatch } from "@/lib/posting/transaction-amounts";
import { buildBillAccounts } from "@/lib/posting/bill-accounts";
import {
  COUNTERPARTY_MISMATCH_CODE,
  counterpartyNamesDiffer,
} from "@/lib/drafts/counterparty-resolution";
import { subledgerContactIdForLine } from "@/lib/accounting/ar-ap-subledger";
import type { DraftInventoryLine } from "@/lib/posting/materialize-amounts";

type DraftsInsert = Database["public"]["Tables"]["drafts"]["Insert"];
type DraftsRow = Database["public"]["Tables"]["drafts"]["Row"];
type DraftsUpdate = Database["public"]["Tables"]["drafts"]["Update"];
type JournalEntriesInsert = Database["public"]["Tables"]["journal_entries"]["Insert"];
type JournalEntriesRow = Database["public"]["Tables"]["journal_entries"]["Row"];
type JournalLinesInsert = Database["public"]["Tables"]["journal_lines"]["Insert"];
type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

/**
 * Legacy bug: tax was sometimes saved as only `{ tax_rate_id }`, which fails DraftEntitiesSchema.
 * Coerce to `{ rate, amount, tax_rate_id? }` for parse.
 */
function normalizeDraftDataJsonForParse(data: Record<string, unknown>): Record<string, unknown> {
  const tax = data.tax;
  if (tax && typeof tax === "object" && tax !== null) {
    const t = tax as Record<string, unknown>;
    if ("tax_rate_id" in t && typeof t.rate !== "number") {
      return {
        ...data,
        tax: {
          rate: 0,
          amount: (t.amount as number | null | undefined) ?? null,
          ...(typeof t.tax_rate_id === "string" ? { tax_rate_id: t.tax_rate_id } : {}),
        },
      };
    }
  }
  return data;
}

/** Inventory-tracked sales and inventory purchases require quantity and unit price on the line. */
function assertInventoryTrackedLineOrThrow(
  draftIntent: string,
  billPurchaseType: string | undefined,
  itemSnap: { item_type?: string; inventory_tracked?: boolean } | undefined,
  inventoryLineItems:
    | Array<{ quantity?: number; unit_price?: number; rate?: number }>
    | undefined,
  skipSingleLineAssert?: boolean,
): void {
  if (skipSingleLineAssert) return;

  const invoiceProductTracked =
    draftIntent === "create_invoice" &&
    itemSnap?.item_type === "product" &&
    itemSnap?.inventory_tracked === true;
  const billInventory = draftIntent === "create_bill" && billPurchaseType === "inventory";

  if (!invoiceProductTracked && !billInventory) return;

  const line = inventoryLineItems?.[0];
  const unitPrice = line?.unit_price ?? line?.rate;
  if (!line || !line.quantity || line.quantity <= 0 || unitPrice == null || Number(unitPrice) < 0) {
    throw new Error("Quantity and Unit Price are required for inventory items.");
  }
}

const InventoryLineDraftSchema = z.object({
  item_id: z.string().uuid(),
  item_name: z.string(),
  /** product | service — drives posting and analytics */
  type: z.enum(["product", "service"]).optional(),
  quantity: z.number(),
  /** Unit selling price (invoice) or unit purchase price (bill); falls back to `rate` for legacy drafts */
  unit_price: z.number().optional(),
  rate: z.number().optional(),
  discount: z.number(),
  tax_rate: z.number(),
  tax_amount: z.number(),
  total: z.number(),
  cost_price: z.number().nullable().optional(),
  revenue_amount: z.number().nullable().optional(),
  cogs_amount: z.number().nullable().optional(),
  margin: z.number().nullable().optional(),
});

const GuidedInvoiceLineSchema = z.object({
  item_id: z.string().uuid(),
  type: z.enum(["product", "service"]),
  quantity: z.number().nullable().optional(),
  unit_price: z.number().nullable().optional(),
  total: z.number(),
  cost_price: z.number().nullable().optional(),
  cogs: z.number().nullable().optional(),
  margin: z.number().nullable().optional(),
  revenue_amount: z.number(),
});

const ItemSnapshotSchema = z.object({
  item_type: z.enum(["product", "service"]),
  inventory_tracked: z.boolean(),
  name: z.string(),
});

const TransactionAmountsSchema = z.object({
  entered_amount: z.number(),
  tax_rate: z.number(),
  tax_treatment: z.enum(["exclusive", "inclusive"]),
  subtotal_amount: z.number(),
  tax_amount: z.number(),
  total_amount: z.number(),
});

const SaveDraftSchema = DraftSchema.extend({
  rawPrompt: z.string().optional(),
  contactId: z.string().uuid().optional().nullable(),
  /** Persisted as data_json.tax for posting (tax line FK). */
  taxRateLink: z.object({ tax_rate_id: z.string().uuid() }).optional(),
  tax_treatment: z.enum(["exclusive", "inclusive"]).optional(),
  selectedItemId: z.string().uuid().optional().nullable(),
  itemSnapshot: ItemSnapshotSchema.optional().nullable(),
  guidedEventRequiresItem: z.boolean().optional(),
  inventoryLineItems: z.array(InventoryLineDraftSchema).optional(),
  billPurchaseType: z.enum(["inventory", "expense", "asset"]).optional(),
  transactionAmounts: TransactionAmountsSchema.optional(),
  fixedAssetDraft: z
    .object({
      name: z.string(),
      category: z.string(),
      asset_account_id: z.string().uuid(),
      useful_life_years: z.number(),
      depreciation_method: z.enum(["straight_line"]),
    })
    .optional(),
  guidedInvoiceLine: GuidedInvoiceLineSchema.optional(),
  receiptAllocationsDraft: z
    .array(z.object({ invoice_id: z.string().uuid(), allocated_amount: z.number().positive() }))
    .optional(),
  paymentAllocationsDraft: z
    .array(z.object({ bill_id: z.string().uuid(), allocated_amount: z.number().positive() }))
    .optional(),
  /** Mixed inventory / expense / asset lines (supplier bill) or product / service lines (invoice). Posted via multi-line engine. */
  documentLineItems: z.array(z.any()).optional(),
});

export async function saveDraftAction(input: z.infer<typeof SaveDraftSchema>) {
  const payload = SaveDraftSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  // Ensure default accounts exist (creates them if missing)
  const { ensureDefaultAccounts } = await import("@/lib/data/accounts");
  try {
    await ensureDefaultAccounts(user.tenant.id);
  } catch (error) {
    console.warn("Failed to ensure default accounts (continuing anyway):", error);
  }

  const supabase = await createServerSupabaseClient();

  // Auto-generate invoice number for invoices if not provided
  const entities = { ...payload.entities };
  if (payload.intent === "create_invoice" && !entities.invoice_number) {
    const { generateInvoiceNumber } = await import("@/lib/utils/invoice-number");
    entities.invoice_number = await generateInvoiceNumber(user.tenant.id);
  }

  const parsedPayload = payload as z.infer<typeof SaveDraftSchema> & {
    taxRateLink?: { tax_rate_id: string };
    tax_treatment?: "exclusive" | "inclusive";
  };

  /** Merge posting tax_rate_id with entities.tax so Zod always sees rate+amount (never overwrite with tax_id-only). */
  let mergedTax = entities.tax ?? null;
  if (parsedPayload.taxRateLink?.tax_rate_id) {
    const base =
      mergedTax &&
      typeof mergedTax === "object" &&
      mergedTax !== null &&
      "rate" in mergedTax &&
      typeof (mergedTax as { rate: unknown }).rate === "number"
        ? (mergedTax as { rate: number; amount: number | null })
        : { rate: 0, amount: null as number | null };
    mergedTax = {
      ...base,
      tax_rate_id: parsedPayload.taxRateLink.tax_rate_id,
    };
  }

  const ext = parsedPayload as z.infer<typeof SaveDraftSchema> & {
    selectedItemId?: string | null;
    itemSnapshot?: z.infer<typeof ItemSnapshotSchema> | null;
    guidedEventRequiresItem?: boolean;
    inventoryLineItems?: z.infer<typeof InventoryLineDraftSchema>[];
    billPurchaseType?: "inventory" | "expense" | "asset";
    transactionAmounts?: z.infer<typeof TransactionAmountsSchema>;
    fixedAssetDraft?: z.infer<typeof SaveDraftSchema>["fixedAssetDraft"];
    guidedInvoiceLine?: z.infer<typeof GuidedInvoiceLineSchema>;
    receiptAllocationsDraft?: Array<{ invoice_id: string; allocated_amount: number }>;
    paymentAllocationsDraft?: Array<{ bill_id: string; allocated_amount: number }>;
    documentLineItems?: Array<Record<string, unknown>>;
  };

  const initialCounterparty =
    typeof entities.counterparty === "string" ? entities.counterparty.trim() : "";

  // Store original prompt and AI-selected accounts in data_json
  const dataJson = {
    ...entities,
    tax: mergedTax,
    ...(initialCounterparty ? { counterparty_ai_extracted: initialCounterparty } : {}),
    original_prompt: parsedPayload.rawPrompt ?? null,
    ai_selected_accounts: payload.accounts ?? null, // Store AI account selections
    ...(ext.selectedItemId ? { selected_item_id: ext.selectedItemId } : {}),
    ...(ext.itemSnapshot ? { item_snapshot: ext.itemSnapshot } : {}),
    ...(ext.guidedEventRequiresItem === true ? { guided_event_requires_item: true } : {}),
    ...(ext.inventoryLineItems && ext.inventoryLineItems.length > 0
      ? { inventory_line_items: ext.inventoryLineItems }
      : {}),
    ...(ext.billPurchaseType ? { bill_purchase_type: ext.billPurchaseType } : {}),
    ...(ext.transactionAmounts ? { transaction_amounts: ext.transactionAmounts } : {}),
    ...(ext.fixedAssetDraft ? { fixed_asset_draft: ext.fixedAssetDraft } : {}),
    ...(ext.guidedInvoiceLine ? { guided_invoice_line: ext.guidedInvoiceLine } : {}),
    ...(ext.receiptAllocationsDraft && ext.receiptAllocationsDraft.length > 0
      ? { receipt_allocations_draft: ext.receiptAllocationsDraft }
      : {}),
    ...(ext.paymentAllocationsDraft && ext.paymentAllocationsDraft.length > 0
      ? { payment_allocations_draft: ext.paymentAllocationsDraft }
      : {}),
    ...(ext.documentLineItems && ext.documentLineItems.length > 0
      ? { document_line_items: ext.documentLineItems }
      : {}),
  };

  // contact_id will be added by migration, using type assertion for now
  const insertData = {
    tenant_id: user.tenant.id,
    intent: payload.intent,
    data_json: dataJson,
    status: "draft",
    created_by: user.id,
    confidence: payload.confidence,
    contact_id: parsedPayload.contactId ?? null,
    ...(parsedPayload.tax_treatment ? { tax_treatment: parsedPayload.tax_treatment } : {}),
  } as DraftsInsert & { contact_id?: string | null };
  // Use type assertion for insert to fix type inference
  // Type assertion to fix Supabase type inference - this is type-safe as we're using Database types
  const table = supabase.from("drafts") as unknown as {
    insert: (values: DraftsInsert[]) => {
      select: (columns?: string) => Promise<{ data: DraftsRow[] | null; error: unknown }>;
    };
  };
  const { data: drafts, error } = await table.insert([insertData]).select("*");
  const data = drafts?.[0] ?? null;

  if (error) {
    console.error("Failed to persist draft", error);
    throw error;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "draft.created",
    entity: "drafts",
    entity_id: data?.id ?? null,
    changes: {
      intent: payload.intent,
      confidence: payload.confidence,
    },
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/drafts");
  revalidatePath("/dashboard");
  revalidatePath("/prompt");
  return data;
}

const FixedAssetDraftUpdateSchema = z.object({
  name: z.string(),
  category: z.string(),
  asset_account_id: z.string().uuid(),
  useful_life_years: z.number().int().positive(),
  depreciation_method: z.enum(["straight_line"]),
});

const UpdateDraftSchema = DraftSchema.extend({
  draftId: z.string().uuid(),
  tax_treatment: z.enum(["exclusive", "inclusive"]).optional(),
  billPurchaseType: z.enum(["inventory", "expense", "asset"]).optional(),
  fixedAssetDraft: FixedAssetDraftUpdateSchema.optional(),
  expenseAccountId: z.string().uuid().optional(),
  selectedItemId: z.string().uuid().optional().nullable(),
});

function inferDebitAccountIdFromDraftData(data: Record<string, unknown>): string | null {
  const ai = data.ai_selected_accounts as
    | { debit_account?: { existing_account_id?: string } }
    | undefined;
  return ai?.debit_account?.existing_account_id ?? null;
}

export async function updateDraftAction(input: z.infer<typeof UpdateDraftSchema>) {
  const payload = UpdateDraftSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();
  const { data: existing, error: fetchError } = await supabase
    .from("drafts")
    .select("id, status, data_json, tax_treatment, contact_id")
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to load draft for update", fetchError);
    throw fetchError;
  }

  if (!existing) {
    throw new Error("Draft not found.");
  }

  // Posted entries are immutable. Unpost first (convert to draft), then edit.
  if (existing.status === "posted") {
    throw new Error(
      "Posted entries are locked. Convert to draft first (Admin/Auditor), then edit."
    );
  }

  const nextStatus = existing.status === "approved" ? "draft" : existing.status;

  // Prevent invoice number changes for invoices - preserve existing invoice number
  const entities = { ...payload.entities };
  if (payload.intent === "create_invoice" && existing?.data_json) {
    const existingData = existing.data_json as { invoice_number?: string | null };
    if (existingData?.invoice_number) {
      entities.invoice_number = existingData.invoice_number;
    } else {
      const { generateInvoiceNumber } = await import("@/lib/utils/invoice-number");
      entities.invoice_number = await generateInvoiceNumber(user.tenant.id);
    }
  }

  const existingDataJson = (existing?.data_json ?? {}) as Record<string, unknown>;

  let resolvedContactId =
    (existing as { contact_id?: string | null }).contact_id ?? null;

  if (payload.intent === "create_bill" || payload.intent === "create_invoice") {
    const raw =
      typeof entities.counterparty === "string" ? entities.counterparty.trim() : "";
    if (raw) {
      const { findOrCreateContactAction } = await import("@/lib/actions/contacts");
      const contact = await findOrCreateContactAction(
        raw,
        payload.intent === "create_bill" ? "vendor" : "customer",
      );
      resolvedContactId = contact.id;
      entities.counterparty = contact.name;
      (entities as Record<string, unknown>).contact_id = contact.id;
    }
  }

  const existingRow = existing as DraftsRow & { tax_treatment?: "exclusive" | "inclusive" | null };
  const effectiveTaxTreatment =
    payload.tax_treatment ?? existingRow.tax_treatment ?? "exclusive";

  const aiExtractedPreserve =
    (existingDataJson.counterparty_ai_extracted as string | undefined)?.trim() ||
    (typeof existingDataJson.counterparty === "string"
      ? existingDataJson.counterparty.trim()
      : "");

  const dataJson: Record<string, unknown> = {
    ...existingDataJson,
    ...entities,
    original_prompt:
      existingDataJson.original_prompt ?? (entities as { original_prompt?: string }).original_prompt ?? null,
    edited_journal_lines: existingDataJson.edited_journal_lines ?? undefined,
    edited_description: existingDataJson.edited_description ?? undefined,
  };

  if (aiExtractedPreserve && !dataJson.counterparty_ai_extracted) {
    dataJson.counterparty_ai_extracted = aiExtractedPreserve;
  }

  if (resolvedContactId) {
    dataJson.counterparty_resolved_id = resolvedContactId;
  }

  if (payload.intent === "create_bill") {
    const ext = payload as z.infer<typeof UpdateDraftSchema> & {
      billPurchaseType?: "inventory" | "expense" | "asset";
      fixedAssetDraft?: z.infer<typeof FixedAssetDraftUpdateSchema>;
      expenseAccountId?: string;
      selectedItemId?: string | null;
    };

    const billPurchaseType =
      ext.billPurchaseType ??
      (existingDataJson.bill_purchase_type as "inventory" | "expense" | "asset" | undefined) ??
      "expense";

    let fixed_asset_draft = existingDataJson.fixed_asset_draft as Record<string, unknown> | undefined;
    if (ext.fixedAssetDraft) {
      fixed_asset_draft = ext.fixedAssetDraft as unknown as Record<string, unknown>;
    }
    if (billPurchaseType !== "asset") {
      fixed_asset_draft = undefined;
    }

    let selected_item_id =
      ext.selectedItemId !== undefined
        ? ext.selectedItemId
        : (existingDataJson.selected_item_id as string | null | undefined);
    if (billPurchaseType !== "inventory") {
      selected_item_id = null;
      dataJson.inventory_line_items = undefined;
      dataJson.guided_event_requires_item = undefined;
    } else {
      dataJson.guided_event_requires_item = true;
    }

    const taxObj =
      dataJson.tax && typeof dataJson.tax === "object"
        ? (dataJson.tax as { tax_rate_id?: string; rate?: number; amount?: number | null })
        : undefined;
    const taxRateId = taxObj?.tax_rate_id ?? null;
    let pct = 0;
    if (taxRateId) {
      const rates = await listTaxRates();
      const tr = rates.find((r) => r.id === taxRateId);
      pct = tr?.percentage ?? 0;
    }

    const enteredAmount = Number(entities.amount);
    const tx = buildTransactionAmounts({
      entered_amount: enteredAmount,
      tax_rate: pct,
      tax_treatment: effectiveTaxTreatment,
    });
    dataJson.transaction_amounts = tx;
    dataJson.tax = taxRateId
      ? { rate: pct, amount: tx.tax_amount, tax_rate_id: taxRateId }
      : null;

    dataJson.bill_purchase_type = billPurchaseType;
    dataJson.fixed_asset_draft = fixed_asset_draft;
    dataJson.selected_item_id = selected_item_id ?? null;

    const coa = await listAccounts();

    let debitId: string | null = null;
    if (billPurchaseType === "asset") {
      const fa = fixed_asset_draft as { asset_account_id?: string } | undefined;
      debitId = fa?.asset_account_id ?? null;
      if (!debitId) {
        throw new Error(
          "Asset purchase cannot be saved until a fixed asset account is selected.",
        );
      }
    } else if (billPurchaseType === "expense") {
      debitId = ext.expenseAccountId ?? inferDebitAccountIdFromDraftData(existingDataJson);
      if (!debitId) {
        throw new Error("Choose an expense category for this supplier bill.");
      }
    } else if (billPurchaseType === "inventory") {
      const itemId = selected_item_id as string | null | undefined;
      if (!itemId) {
        throw new Error("Select an inventory-tracked product for this purchase.");
      }
      const { getBusinessItemById } = await import("@/lib/data/inventory");
      const item = await getBusinessItemById(itemId);
      if (!item || item.item_type !== "product" || item.inventory_tracked !== true) {
        throw new Error("Select an inventory-tracked product for inventory purchases.");
      }
      debitId = item.inventory_account_id ?? null;
      if (!debitId) {
        throw new Error("Selected item is missing an inventory account mapping.");
      }
      dataJson.item_snapshot = {
        item_type: item.item_type,
        inventory_tracked: item.inventory_tracked,
        name: item.name,
      };
      const q = 1;
      dataJson.inventory_line_items = [
        {
          item_id: itemId,
          item_name: item.name,
          type: "product" as const,
          quantity: q,
          unit_price: tx.subtotal_amount / q,
          rate: tx.subtotal_amount / q,
          discount: 0,
          tax_rate: pct,
          tax_amount: tx.tax_amount,
          total: tx.total_amount,
        },
      ];
    }

    dataJson.ai_selected_accounts = await buildBillAccounts(
      coa as Account[],
      debitId,
      taxRateId,
    );
  } else {
    dataJson.ai_selected_accounts = existingDataJson.ai_selected_accounts ?? null;
  }

  const updateData: DraftsUpdate = {
    intent: payload.intent,
    data_json: dataJson as DraftsUpdate["data_json"],
    confidence: payload.confidence,
    status: nextStatus,
    contact_id: resolvedContactId,
  };

  const updateDataWithTaxTreatment = {
    ...updateData,
    ...(payload.tax_treatment && { tax_treatment: payload.tax_treatment }),
  } as DraftsUpdate & { tax_treatment?: "exclusive" | "inclusive" };
  const table = supabase.from("drafts") as unknown as {
    update: (values: DraftsUpdate) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ error: unknown }>;
      };
    };
  };
  const { error } = await table
    .update(updateDataWithTaxTreatment)
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id);

  if (error) {
    console.error("Failed to update draft", error);
    throw error;
  }

  /** Conflict – mark user override when editing AI-generated draft. */
  const fromPrompt = !!(existingDataJson.original_prompt ?? (existingDataJson as { original_prompt_text?: string }).original_prompt_text);

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "draft.updated",
    entity: "drafts",
    entity_id: payload.draftId,
    changes: {
      intent: payload.intent,
      ...(fromPrompt ? { user_override: true } : {}),
    },
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/drafts");
  return { success: true };
}

const ApprovePayload = z.object({
  draftId: z.string().uuid(),
});

export async function approveDraftAction(input: z.infer<typeof ApprovePayload>) {
  const payload = ApprovePayload.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  if (!canApprove(user.role as UserRole)) {
    throw new Error("You do not have permission to approve drafts.");
  }

  const supabase = await createServerSupabaseClient();
  const updateData: DraftsUpdate = {
    status: "approved",
    approved_by: user.id,
    approved_at: new Date().toISOString(),
  };
  // Type assertion to fix Supabase type inference
  const table = supabase.from("drafts") as unknown as {
    update: (values: DraftsUpdate) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          select: (columns?: string) => {
            single: () => Promise<{ data: DraftsRow | null; error: unknown }>;
          };
        };
      };
    };
  };
  const { data: updated, error } = await table
    .update(updateData)
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  if (!updated) {
    throw new Error("Failed to update draft");
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "draft.approved",
    entity: "drafts",
    entity_id: payload.draftId,
    changes: null,
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/drafts");
  // Return updated draft for real-time UI updates
  return {
    id: updated.id,
    status: updated.status,
    approved_by: updated.approved_by,
    approved_at: updated.approved_at,
  };
}

const PostDraftSchema = z.object({
  draftId: z.string().uuid(),
  /** Set true after user confirms AI-extracted name differs from selected contact */
  acknowledgeCounterpartyDifference: z.boolean().optional(),
});

function generatePostReferenceId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function throwWithReference(message: string, refId: string, isDev: boolean, cause?: unknown): never {
  const refMsg = `Posting failed. Reference: ${refId}`;
  const causeMsg = isDev ? getErrorMessage(cause, "") : "";
  const fullMsg = isDev && causeMsg ? `${refMsg}\n${causeMsg}` : refMsg;
  const err = new Error(fullMsg) as Error & { referenceId?: string; cause?: unknown };
  err.referenceId = refId;
  err.cause = cause;
  throw err;
}

export async function postDraftAction(input: z.infer<typeof PostDraftSchema>) {
  const refId = generatePostReferenceId();
  const isDev = process.env.NODE_ENV !== "production";

  const payload = PostDraftSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  if (!canApprove(user.role as UserRole)) {
    throw new Error("You do not have permission to post journal entries.");
  }

  const supabase = await createServerSupabaseClient();

  let { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select<"*", DraftsRow>("*")
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (draftError) {
    console.error("[postDraft]", { refId, tenant_id: user.tenant.id, user_id: user.id, draft_id: payload.draftId, error: draftError });
    throwWithReference("Draft could not be loaded.", refId, isDev, draftError);
  }

  if (!draft) {
    throw new Error("Draft not found.");
  }

  if (draft.status !== "approved" && draft.status !== "posted") {
    throw new Error("Draft must be approved before posting.");
  }

  // If already posted, return the draft object for consistency
  if (draft.posted_entry_id) {
    return {
      id: draft.id,
      status: draft.status,
      posted_entry_id: draft.posted_entry_id,
    };
  }

  if (
    (draft.intent === "create_bill" || draft.intent === "create_invoice") &&
    !(draft as { contact_id?: string | null }).contact_id
  ) {
    const dj0 = draft.data_json as Record<string, unknown>;
    const cp0 = typeof dj0.counterparty === "string" ? dj0.counterparty.trim() : "";
    if (!cp0) {
      throw new Error(
        draft.intent === "create_bill"
          ? "Supplier is required before posting."
          : "Customer is required before posting.",
      );
    }
    const { findOrCreateContactAction } = await import("@/lib/actions/contacts");
    const contact = await findOrCreateContactAction(
      cp0,
      draft.intent === "create_bill" ? "vendor" : "customer",
    );
    const nextJson: Record<string, unknown> = {
      ...dj0,
      counterparty: contact.name,
      contact_id: contact.id,
    };
    if (!dj0.counterparty_ai_extracted) {
      nextJson.counterparty_ai_extracted = cp0;
    }
    const { data: upd, error: upErr } = await supabase
      .from("drafts")
      .update({
        contact_id: contact.id,
        data_json: nextJson as DraftsRow["data_json"],
      })
      .eq("id", draft.id)
      .eq("tenant_id", user.tenant.id)
      .select("*")
      .maybeSingle();
    if (upErr || !upd) {
      throw new Error("Could not resolve counterparty on draft before posting.");
    }
    draft = upd as DraftsRow;
  }

  const draftDataForMismatch = draft.data_json as Record<string, unknown>;
  const aiExtracted = (draftDataForMismatch.counterparty_ai_extracted as string | undefined)?.trim();
  const contactIdForDraft = (draft as { contact_id?: string | null }).contact_id;
  if (
    aiExtracted &&
    contactIdForDraft &&
    !payload.acknowledgeCounterpartyDifference &&
    (draft.intent === "create_bill" || draft.intent === "create_invoice")
  ) {
    const { data: crow } = await supabase
      .from("contacts")
      .select("name")
      .eq("id", contactIdForDraft)
      .maybeSingle();
    const resolvedNm = (crow?.name ?? "").trim();
    if (counterpartyNamesDiffer(aiExtracted, resolvedNm)) {
      throw new Error(
        `${COUNTERPARTY_MISMATCH_CODE}: The name on the uploaded document differs from the selected supplier/customer. Continue?`,
      );
    }
  }

  // Get all accounts for validation and journal line generation
  const allAccounts = await listAccounts();

  // Ensure default accounts exist before posting
  const { ensureDefaultAccounts } = await import("@/lib/data/accounts");
  try {
    await ensureDefaultAccounts(user.tenant.id);
  } catch (error) {
    console.warn("Failed to ensure default accounts (continuing anyway):", error);
  }

  // Get accounts for validation and journal line generation (reuse allAccounts from above)
  
  // Check if draft has edited journal lines
  const draftDataRaw = draft.data_json as Record<string, unknown>;
  const draftDataForParse = normalizeDraftDataJsonForParse(draftDataRaw);
  const editedLines = draftDataRaw.edited_journal_lines as
    | Array<{
        account_id: string;
        debit: number;
        credit: number;
        memo: string | null;
        tax_rate_id?: string | null;
      }>
    | undefined;
  const editedDescription = draftDataRaw.edited_description as string | undefined;

  // Parse draft first (needed for date extraction)
  // Extract AI-selected accounts from data_json if available
  const aiSelectedAccounts = draftDataRaw.ai_selected_accounts as unknown;

  const parsedDraft = DraftSchema.parse({
    intent: draft.intent,
    entities: draftDataForParse,
    confidence: draft.confidence ? Number(draft.confidence) : 0,
    accounts: aiSelectedAccounts ?? undefined,
  });

  const hasPurchaseDocLines =
    draft.intent === "create_bill" &&
    Array.isArray(draftDataRaw.document_line_items) &&
    draftDataRaw.document_line_items.length > 0;
  const hasSalesDocLinesEarly =
    draft.intent === "create_invoice" &&
    Array.isArray(draftDataRaw.document_line_items) &&
    draftDataRaw.document_line_items.length > 0;

  // Deterministic tax math validation (single source of truth). Multi-line docs use per-line tax — totals validated at posting.
  if (draft.intent === "create_bill" && !hasPurchaseDocLines) {
    const taxRateId = (draftDataRaw as { tax?: { tax_rate_id?: string } })?.tax?.tax_rate_id ?? null;
    let pct = 0;
    if (taxRateId) {
      const rates = await listTaxRates();
      const tr = rates.find((r) => r.id === taxRateId);
      if (!tr) throw new Error("Select a valid tax rate before posting.");
      pct = tr.percentage;
    }
    const taxTreatment = ((draft as DraftsRow & { tax_treatment?: "exclusive" | "inclusive" | null })
      .tax_treatment ?? "exclusive") as "exclusive" | "inclusive";
    const expected = buildTransactionAmounts({
      entered_amount: Number(parsedDraft.entities.amount),
      tax_rate: pct,
      tax_treatment: taxTreatment,
    });
    let tx = draftDataRaw.transaction_amounts as typeof expected | undefined;
    if (!tx) {
      tx = expected;
    }
    const match = validateTransactionAmountsMatch(expected, tx);
    if (!match.ok) {
      throw new Error(match.error);
    }
  }

  if (draft.intent === "create_bill") {
    const billPurchaseType = draftDataRaw.bill_purchase_type as string | undefined;
    if (!hasPurchaseDocLines && billPurchaseType === "asset") {
      const fa = draftDataRaw.fixed_asset_draft as
        | {
            name?: string;
            category?: string;
            asset_account_id?: string;
            useful_life_years?: number;
            depreciation_method?: string;
          }
        | undefined;
      const cp = parsedDraft.entities.counterparty;
      if (!fa?.name?.trim()) {
        throw new Error(
          "Asset purchase cannot be posted until asset name, category, fixed asset account, and depreciation settings are completed.",
        );
      }
      if (!fa?.category) {
        throw new Error(
          "Asset purchase cannot be posted until asset category, fixed asset account, and depreciation settings are completed.",
        );
      }
      if (!fa?.asset_account_id) {
        throw new Error(
          "Asset purchase cannot be posted until a fixed asset account is selected.",
        );
      }
      if (!fa?.useful_life_years || fa.useful_life_years <= 0) {
        throw new Error(
          "Asset purchase cannot be posted until useful life and depreciation settings are completed.",
        );
      }
      if (fa.depreciation_method !== "straight_line") {
        throw new Error(
          "Asset purchase cannot be posted until depreciation method is set (straight-line).",
        );
      }
      if (!cp || (typeof cp === "string" && !cp.trim())) {
        throw new Error("Supplier is required before posting this bill.");
      }
    }
  }

  const tax = (draftDataRaw as { tax?: { tax_rate_id?: string } })?.tax;
  const taxRateIdForLines = tax?.tax_rate_id ?? null;
  if (tax?.tax_rate_id) {
    const rates = await listTaxRates();
    const valid = rates.some((r) => r.id === tax.tax_rate_id);
    if (!valid) {
      throw new Error(
        "Select a valid tax rate before posting. The selected tax rate may have been removed or deactivated."
      );
    }
  }

  let description: string;
  let lines: JournalLine[];

  const draftWithTaxTreatment = draft as DraftsRow & { tax_treatment?: "exclusive" | "inclusive" | null };
  const taxTreatment = draftWithTaxTreatment.tax_treatment ?? "exclusive";

  let multiLineBillInventoryForPosting: Array<DraftInventoryLine & { item_name: string }> | null = null;
  let multiLineBillAssetsForPosting: Array<{
    line_net: number;
    asset: {
      name: string;
      category: string;
      asset_account_id: string;
      useful_life_years: number;
      depreciation_method: "straight_line";
    };
  }> | null = null;
  let multiLineInvoiceInventoryForPosting: Array<DraftInventoryLine & { item_name: string }> | null = null;

  if (editedLines && editedLines.length > 0) {
    // Use edited journal lines
    description = editedDescription ?? (draftDataRaw.description as string) ?? "";
    lines = editedLines.map((line) => ({
      account_id: line.account_id,
      debit: Number(line.debit),
      credit: Number(line.credit),
      memo: line.memo ?? null,
      tax_rate_id: line.tax_rate_id ?? null,
    }));
  } else if (hasPurchaseDocLines) {
    const { parseBillDocumentLines, buildMultiLineBillPostingContext } = await import(
      "@/lib/posting/multi-line-documents"
    );
    const parsedLines = parseBillDocumentLines(draftDataRaw.document_line_items);
    const rates = await listTaxRates();
    const cp = typeof parsedDraft.entities.counterparty === "string" ? parsedDraft.entities.counterparty : "";
    const postingDate = (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10);
    const multi = await buildMultiLineBillPostingContext({
      lines: parsedLines,
      accounts: allAccounts as Account[],
      taxTreatment,
      counterparty: cp || "Supplier",
      postingDate,
      taxRates: rates,
    });
    const tx = draftDataRaw.transaction_amounts as { total_amount?: number } | undefined;
    if (tx?.total_amount != null && Math.abs(tx.total_amount - multi.documentTotal) > 0.02) {
      throw new Error(
        "Multi-line totals do not match the document total. Check each line and tax, then try again.",
      );
    }
    description = multi.description;
    lines = multi.lines;
    multiLineBillInventoryForPosting = multi.inventoryLinesForPurchase;
    multiLineBillAssetsForPosting = multi.assetLines;
  } else if (hasSalesDocLinesEarly) {
    const { parseInvoiceDocumentLines, buildMultiLineInvoicePostingContext } = await import(
      "@/lib/posting/multi-line-documents"
    );
    const parsedLines = parseInvoiceDocumentLines(draftDataRaw.document_line_items);
    const rates = await listTaxRates();
    const cp = typeof parsedDraft.entities.counterparty === "string" ? parsedDraft.entities.counterparty : "";
    const postingDate = (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10);
    const multi = await buildMultiLineInvoicePostingContext({
      lines: parsedLines,
      accounts: allAccounts as Account[],
      taxTreatment,
      counterparty: cp || "Customer",
      postingDate,
      taxRates: rates,
    });
    const tx = draftDataRaw.transaction_amounts as { total_amount?: number } | undefined;
    if (tx?.total_amount != null && Math.abs(tx.total_amount - multi.documentTotal) > 0.02) {
      throw new Error(
        "Multi-line totals do not match the document total. Check each line and tax, then try again.",
      );
    }
    description = multi.description;
    lines = multi.lines;
    multiLineInvoiceInventoryForPosting = multi.inventoryLinesForSale;
  } else {
    // Generate journal lines from draft using AI-selected accounts or fallback
    const result = await buildDefaultJournalLines(parsedDraft, allAccounts as Account[], null, {
      tenantId: user.tenant.id,
      tax_treatment: taxTreatment,
      taxRateId: taxRateIdForLines,
    });
    description = result.description;
    lines = result.lines;
  }

  if (lines.length === 0) {
    throw new Error("No journal lines generated for draft.");
  }

  // Fail-fast validation before any DB write
  try {
    ensureBalanced(lines);
    const accountIds = [...new Set(lines.map((l) => l.account_id))];
    const accountMap = new Map((allAccounts as Account[]).map((a) => [a.id, a]));
    for (const aid of accountIds) {
      const acc = accountMap.get(aid);
      if (!acc) {
        throw new Error(`Account ${aid} not found in chart of accounts.`);
      }
      if (acc.is_active === false) {
        throw new Error(`Account ${acc.code} (${acc.name}) is inactive.`);
      }
    }
    const entryDate = (draftDataRaw as { date?: string }).date;
    if (entryDate) {
      const d = new Date(entryDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (d > today) {
        throw new Error("Transaction date cannot be in the future.");
      }
    }
  } catch (validationErr) {
    console.error("[postDraft] validation", { refId, tenant_id: user.tenant.id, draft_id: draft.id, error: validationErr });
    throwWithReference(
      getErrorMessage(validationErr, "Validation failed."),
      refId,
      isDev,
      validationErr
    );
  }

  try {
  // Extract inventory line items from draft if present (multi-line documents override)
  let inventoryLineItems = draftDataRaw.inventory_line_items as
    | Array<{
        item_id: string;
        item_name: string;
        quantity: number;
        unit_price?: number;
        rate?: number;
        discount: number;
        tax_rate: number;
        tax_amount: number;
        total: number;
      }>
    | undefined;

  if (multiLineBillInventoryForPosting != null) {
    inventoryLineItems = multiLineBillInventoryForPosting.map((l) => ({
      ...l,
      discount: 0,
    }));
  }
  if (multiLineInvoiceInventoryForPosting != null) {
    inventoryLineItems = multiLineInvoiceInventoryForPosting.map((l) => ({
      ...l,
      discount: 0,
    }));
  }

  const itemSnap = draftDataRaw.item_snapshot as
    | { item_type?: string; inventory_tracked?: boolean }
    | undefined;
  const billPurchaseType = draftDataRaw.bill_purchase_type as string | undefined;
  const guidedRequiresItem = draftDataRaw.guided_event_requires_item === true;
  if (guidedRequiresItem && !draftDataRaw.selected_item_id) {
    throw new Error(
      "Please select or create an item so inventory/accounting can be handled correctly.",
    );
  }
  assertInventoryTrackedLineOrThrow(
    draft.intent,
    billPurchaseType,
    itemSnap,
    inventoryLineItems,
    multiLineBillInventoryForPosting != null || multiLineInvoiceInventoryForPosting != null,
  );

  // Process inventory items for invoices (sales) and bills (purchases)
  const inventoryTransactionIds: string[] = [];
  
  if (inventoryLineItems && inventoryLineItems.length > 0) {
    if (draft.intent === "create_invoice") {
      // SALES: Process inventory items for sale
      // For each item: Calculate COGS, create inventory transaction, add COGS journal line
      const { calculateCOGSFIFO, calculateCOGSWeightedAverage } = await import("@/lib/inventory/valuation");
      const { updateInventoryBalanceAfterSale } = await import("@/lib/inventory/valuation");
      const { getInventoryBalance, getInventoryItem } = await import("@/lib/data/inventory");

      const entryDate = (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10);

      for (const lineItem of inventoryLineItems) {
        // Get inventory item to determine accounts and valuation method
        const inventoryItem = await getInventoryItem(lineItem.item_id);
        if (!inventoryItem) {
          throw new Error(`Inventory item ${lineItem.item_id} not found`);
        }

        // Use item-level accounts (from inventory_item table)
        // Type assertion needed since these fields may not be in types yet
        const inventoryItemWithAccounts = inventoryItem as any;
        const inventoryAccountId = inventoryItemWithAccounts.inventory_account_id;
        const cogsAccountId = inventoryItemWithAccounts.cogs_account_id;

        if (!inventoryAccountId || !cogsAccountId) {
          throw new Error(`Inventory item ${inventoryItem.name} is missing inventory_account_id or cogs_account_id. Please update the item or run the migration.`);
        }

        // Get current balance to check quantity
        const currentBalance = await getInventoryBalance(lineItem.item_id);
        if (!currentBalance || Number(currentBalance.quantity) < lineItem.quantity) {
          throw new Error(`Insufficient inventory for ${inventoryItem.name}. Available: ${currentBalance?.quantity || 0}, Required: ${lineItem.quantity}`);
        }

        // Calculate COGS based on valuation method
        let cogsAmount = 0;
        if (inventoryItem.valuation_method === "fifo") {
          cogsAmount = await calculateCOGSFIFO(
            user.tenant.id,
            lineItem.item_id,
            lineItem.quantity,
            entryDate
          );
        } else {
          cogsAmount = await calculateCOGSWeightedAverage(
            user.tenant.id,
            lineItem.item_id,
            lineItem.quantity
          );
        }

        // Update inventory balance (reduces quantity and value)
        await updateInventoryBalanceAfterSale(
          user.tenant.id,
          lineItem.item_id,
          lineItem.quantity,
          cogsAmount,
          entryDate
        );

        // Create inventory transaction record
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invTransactionTable = supabase.from("inventory_transactions" as never) as unknown as {
          insert: (values: any[]) => {
            select: (columns: string) => {
              single: () => Promise<{ data: { id: string } | null; error: unknown }>;
            };
          };
        };
        
        const { data: invTransaction, error: invTxError } = await invTransactionTable.insert([
          {
            tenant_id: user.tenant.id,
            item_id: lineItem.item_id,
            transaction_type: "sale",
            date: entryDate,
            quantity: lineItem.quantity,
            unit_cost: cogsAmount / lineItem.quantity, // Average cost per unit
            total_cost: cogsAmount,
            cogs_amount: cogsAmount,
            journal_entry_id: null, // Will be set after journal entry is created
            draft_id: payload.draftId,
            notes: `Sale: ${lineItem.item_name}`,
          },
        ]).select("id").single();

        if (invTxError) {
          console.error("Failed to create inventory transaction:", invTxError);
          throw new Error(`Failed to create inventory transaction for ${lineItem.item_name}`);
        }

        if (invTransaction && invTransaction.id) {
          inventoryTransactionIds.push(invTransaction.id);

          // Add COGS journal line: DR COGS (using item-level COGS account)
          lines.push({
            account_id: cogsAccountId, // Use item-level COGS account
            debit: cogsAmount,
            credit: 0,
            memo: `COGS: ${lineItem.item_name} (${lineItem.quantity})`,
          });

          // Add inventory reduction journal line: CR Inventory (using item-level inventory account)
          // Find and update the existing inventory credit line, or add new one
          const inventoryLineIndex = lines.findIndex(
            (line) => line.account_id === inventoryAccountId && line.credit > 0
          );

          if (inventoryLineIndex >= 0) {
            // Add to existing inventory credit line
            lines[inventoryLineIndex].credit += cogsAmount;
            lines[inventoryLineIndex].memo = `${lines[inventoryLineIndex].memo || ""}; Sale: ${lineItem.item_name}`;
          } else {
            // Add new inventory credit line
            lines.push({
              account_id: inventoryAccountId, // Use item-level inventory account
              debit: 0,
              credit: cogsAmount,
              memo: `Inventory Sale: ${lineItem.item_name} (${lineItem.quantity})`,
            });
          }
        }
      }
    } else if (draft.intent === "create_bill") {
      // PURCHASES: Process inventory items for purchase
      // For each item: Create inventory transaction, update balance, add inventory journal line
      const { updateInventoryBalanceAfterPurchase } = await import("@/lib/inventory/valuation");
      const { getInventoryItem } = await import("@/lib/data/inventory");

      const entryDate = (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10);

      for (const lineItem of inventoryLineItems) {
        // Get inventory item to determine valuation method, unit cost, and accounts
        const inventoryItem = await getInventoryItem(lineItem.item_id);
        if (!inventoryItem) {
          throw new Error(`Inventory item ${lineItem.item_id} not found`);
        }

        // Use item-level inventory account (from inventory_item table)
        // Type assertion needed since these fields may not be in types yet
        const inventoryItemWithAccounts = inventoryItem as any;
        const inventoryAccountId = inventoryItemWithAccounts.inventory_account_id;

        if (!inventoryAccountId) {
          throw new Error(`Inventory item ${inventoryItem.name} is missing inventory_account_id. Please update the item or run the migration.`);
        }

        // For purchases, unit_cost is unit price per unit (legacy field: rate)
        const unitCost = Number(lineItem.unit_price ?? lineItem.rate);
        if (!Number.isFinite(unitCost)) {
          throw new Error("Quantity and Unit Price are required for inventory items.");
        }
        const totalCost = lineItem.quantity * unitCost;

        // Update inventory balance (increases quantity and value)
        await updateInventoryBalanceAfterPurchase(
          user.tenant.id,
          lineItem.item_id,
          lineItem.quantity,
          unitCost,
          inventoryItem.valuation_method,
          entryDate
        );

        // Create inventory transaction record
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invTransactionTable = supabase.from("inventory_transactions" as never) as unknown as {
          insert: (values: any[]) => {
            select: (columns: string) => {
              single: () => Promise<{ data: { id: string } | null; error: unknown }>;
            };
          };
        };
        
        const { data: invTransaction, error: invTxError } = await invTransactionTable.insert([
          {
            tenant_id: user.tenant.id,
            item_id: lineItem.item_id,
            transaction_type: "purchase",
            date: entryDate,
            quantity: lineItem.quantity,
            unit_cost: unitCost,
            total_cost: totalCost,
            cogs_amount: null, // Not applicable for purchases
            journal_entry_id: null, // Will be set after journal entry is created
            draft_id: payload.draftId,
            notes: `Purchase: ${lineItem.item_name}`,
          },
        ]).select("id").single();

        if (invTxError) {
          console.error("Failed to create inventory transaction:", invTxError);
          throw new Error(`Failed to create inventory transaction for ${lineItem.item_name}`);
        }

        if (invTransaction && invTransaction.id) {
          inventoryTransactionIds.push(invTransaction.id);

          // Multi-line bills already include correct inventory debits in `lines`.
          if (multiLineBillInventoryForPosting === null) {
            // Legacy single-line bill: map expense line → inventory debit
            const expenseLineIndex = lines.findIndex(
              (line) => line.debit > 0 && line.credit === 0 && line.account_id !== inventoryAccountId
            );
            const inventoryDebitIndex = lines.findIndex(
              (line) => line.debit > 0 && line.credit === 0 && line.account_id === inventoryAccountId
            );

            if (inventoryDebitIndex >= 0) {
              // Mapping already debits inventory (preview + posting align). No journal mutation needed here.
            } else if (expenseLineIndex >= 0) {
              lines[expenseLineIndex] = {
                account_id: inventoryAccountId,
                debit: totalCost,
                credit: 0,
                memo: `Inventory Purchase: ${lineItem.item_name} (${lineItem.quantity})`,
              };
            } else {
              lines.push({
                account_id: inventoryAccountId,
                debit: totalCost,
                credit: 0,
                memo: `Inventory Purchase: ${lineItem.item_name} (${lineItem.quantity})`,
              });
            }
          }
        }
      }

      // Re-balance the journal entry (adjust credit side if needed)
      // This handles cases where inventory purchase total differs from bill amount
    }
  }

  // Asset record is created after journal entry exists (below).

  // Validation: Check if any journal line uses an inventory account without inventory_item_id
  // Get all inventory items to check which accounts are inventory accounts
  const { getInventoryItems } = await import("@/lib/data/inventory");
  const allInventoryItems = await getInventoryItems();
  const inventoryAccountIds = new Set<string>();
  
  // Collect inventory account IDs from inventory items
  allInventoryItems.forEach((item) => {
    const invAccountId = (item as { inventory_account_id?: string | null }).inventory_account_id;
    if (invAccountId) {
      inventoryAccountIds.add(invAccountId);
    }
  });

  // Also check by code range (1200-1299 is typically inventory)
  const inventoryAccountsByCode = allAccounts.filter((acc) => {
    const codeNum = parseInt(acc.code, 10);
    return acc.type === "asset" && codeNum >= 1200 && codeNum < 1300;
  });
  inventoryAccountsByCode.forEach((acc) => inventoryAccountIds.add(acc.id));

  // Check if any journal line uses an inventory account
  const linesUsingInventoryAccounts = lines.filter((line) => {
    if (line.debit > 0 && line.credit === 0) {
      // Debit to inventory account (purchase)
      return inventoryAccountIds.has(line.account_id);
    }
    if (line.credit > 0 && line.debit === 0) {
      // Credit to inventory account (sale)
      return inventoryAccountIds.has(line.account_id);
    }
    return false;
  });

  // If journal lines use inventory accounts, there must be inventory_line_items
  if (linesUsingInventoryAccounts.length > 0) {
    if (!inventoryLineItems || inventoryLineItems.length === 0) {
      const accountNames = linesUsingInventoryAccounts
        .map((line) => {
          const account = allAccounts.find((a) => a.id === line.account_id);
          return account ? `${account.code} ${account.name}` : "Unknown";
        })
        .join(", ");
      throw new Error(
        `Journal entry uses inventory account(s) (${accountNames}) but no inventory items are selected. ` +
        `Please add inventory items to this draft or change the account to a non-inventory account.`
      );
    }

    // Verify that each inventory account used has a corresponding inventory_line_item
    for (const line of linesUsingInventoryAccounts) {
      const account = allAccounts.find((a) => a.id === line.account_id);
      if (!account) continue;

      // Check if there's an inventory item that uses this account
      const hasMatchingItem = inventoryLineItems.some((item) => {
        const invItem = allInventoryItems.find((i) => i.id === item.item_id);
        if (!invItem) return false;
        const invAccountId = (invItem as { inventory_account_id?: string | null }).inventory_account_id;
        return invAccountId === line.account_id;
      });

      if (!hasMatchingItem) {
        throw new Error(
          `Journal entry uses inventory account ${account.code} ${account.name}, but no inventory item is linked to this account. ` +
          `Please select an inventory item that uses this account, or change the account.`
        );
      }
    }
  }

  ensureBalanced(lines);

  const usedEditedLinesForProvenance = Boolean(editedLines && editedLines.length > 0);
  lines = annotateDraftPostingLines(lines, draft.id, usedEditedLinesForProvenance);

  // Get contact_id from draft if available (will be available after migration)
  const draftContactId = (draft as { contact_id?: string | null }).contact_id;

  // Extract currency information from draft entities
  const draftEntities = parsedDraft.entities as Record<string, unknown>;
  const transactionCurrency = (draftEntities.currency as string) || null;
  const transactionAmount = typeof draftEntities.amount === "number" ? draftEntities.amount : null;
  
  // Get tenant base currency
  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);
  
  // Calculate FX rate and base amount
  let fxRate: number | null = null;
  let amountInBaseCurrency: number | null = null;
  
  if (transactionCurrency && transactionAmount !== null) {
    if (transactionCurrency.toUpperCase() === baseCurrency.toUpperCase()) {
      // Same currency, no conversion needed
      fxRate = 1.0;
      amountInBaseCurrency = transactionAmount;
    } else {
      // Different currency - fetch FX rate
      try {
        const { convertCurrency } = await import("@/lib/utils/currency-conversion");
        const entryDate = (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10);
        amountInBaseCurrency = await convertCurrency(
          transactionAmount,
          transactionCurrency,
          baseCurrency,
          entryDate,
          user.tenant.id
        );
        fxRate = amountInBaseCurrency / transactionAmount;
      } catch (error) {
        console.error("Failed to convert currency, using 1:1:", error);
        fxRate = 1.0;
        amountInBaseCurrency = transactionAmount;
      }
    }
  }

  const postingDate =
    (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10);
  await assertPostingDateAllowed(supabase, user.tenant.id, postingDate);

  // contact_id and currency fields will be added by migration, using type assertion for now
  const entryData = {
    tenant_id: user.tenant.id,
    date: postingDate,
    description,
    status: "posted",
    created_by: user.id,
    approved_by: user.id,
    posted_at: new Date().toISOString(),
    source_module: "drafts",
    contact_id: draftContactId ?? null,
    transaction_currency: transactionCurrency,
    amount_in_transaction_currency: transactionAmount,
    base_currency: transactionCurrency ? baseCurrency : null,
    fx_rate: fxRate,
    amount_in_base_currency: amountInBaseCurrency,
  } as JournalEntriesInsert & { 
    contact_id?: string | null;
    transaction_currency?: string | null;
    amount_in_transaction_currency?: number | null;
    base_currency?: string | null;
    fx_rate?: number | null;
    amount_in_base_currency?: number | null;
  };
  // Use type assertion for insert to fix type inference
  // Type assertion to fix Supabase type inference - this is type-safe as we're using Database types
  const entryTable = supabase.from("journal_entries") as unknown as {
    insert: (values: JournalEntriesInsert[]) => {
      select: (columns?: string) => Promise<{ data: JournalEntriesRow[] | null; error: unknown }>;
    };
  };
  const { data: entries, error: entryError } = await entryTable.insert([entryData]).select("*");
  const entry = entries?.[0] ?? null;

  if (entryError) {
    throw entryError;
  }

  if (!entry) {
    throw new Error("Failed to create journal entry.");
  }

  // Asset purchase: create asset record + depreciation schedule (requires posted journal entry id).
  if (draft.intent === "create_bill" && multiLineBillAssetsForPosting && multiLineBillAssetsForPosting.length > 0) {
    const { createFixedAssetFromPostedBill } = await import("@/lib/posting/fixed-assets");
    const purchaseDate = (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10);
    for (const row of multiLineBillAssetsForPosting) {
      await createFixedAssetFromPostedBill(supabase, {
        tenantId: user.tenant.id,
        draftId: draft.id,
        journalEntryId: entry.id,
        purchaseDate,
        subtotalAmount: row.line_net,
        asset: row.asset,
      });
    }
  } else if (draft.intent === "create_bill" && draftDataRaw.bill_purchase_type === "asset") {
    const assetDraft = draftDataRaw.fixed_asset_draft as
      | {
          name: string;
          category: string;
          asset_account_id: string;
          useful_life_years: number;
          depreciation_method: "straight_line";
        }
      | undefined;
    const tx = draftDataRaw.transaction_amounts as
      | { subtotal_amount?: number }
      | undefined;
    if (!assetDraft) {
      throw new Error("Asset details are missing. Please review and try again.");
    }
    const { createFixedAssetFromPostedBill } = await import("@/lib/posting/fixed-assets");
    await createFixedAssetFromPostedBill(supabase, {
      tenantId: user.tenant.id,
      draftId: draft.id,
      journalEntryId: entry.id,
      purchaseDate: (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10),
      subtotalAmount: Number(tx?.subtotal_amount ?? parsedDraft.entities.amount),
      asset: assetDraft,
    });
  }

  try {
    const lineCurrency =
      transactionCurrency || baseCurrency || null;
    const accountById = new Map(
      allAccounts.map((a) => [a.id, a as { code: string; prd_account_kind?: string | null }]),
    );
    const linesData: JournalLinesInsert[] = lines.map((line) => {
      const acc = accountById.get(line.account_id);
      const contactForLine = subledgerContactIdForLine(
        { prd_account_kind: acc?.prd_account_kind ?? null, code: acc?.code ?? "" },
        draftContactId,
      );
      return {
        entry_id: entry?.id ?? "",
        account_id: line.account_id,
        memo: line.memo ?? null,
        debit: Number(line.debit),
        credit: Number(line.credit),
        contact_id: contactForLine,
        currency_code: lineCurrency,
        tax_rate_id: line.tax_rate_id ?? null,
        account_source: line.account_source ?? null,
        reference_type: line.reference_type ?? null,
        reference_id: line.reference_id ?? null,
      };
    });
    // Use type assertion for insert to fix type inference
    // Type assertion to fix Supabase type inference - this is type-safe as we're using Database types
    const linesTable = supabase.from("journal_lines") as unknown as {
      insert: (values: JournalLinesInsert[]) => Promise<{ error: unknown }>;
    };
    const { error: linesError } = await linesTable.insert(linesData);

    if (linesError) {
      throw linesError;
    }
  } catch (error) {
    // Rollback entry creation if lines fail
    await supabase.from("journal_entries").delete().eq("id", entry.id);
    throw error;
  }

  // Update draft to mark as posted and return updated draft
  const updateData: DraftsUpdate = {
    status: "posted",
    posted_entry_id: entry.id,
  };
  // Type assertion to fix Supabase type inference
  const draftTable = supabase.from("drafts") as unknown as {
    update: (values: DraftsUpdate) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          select: (columns?: string) => {
            single: () => Promise<{ data: DraftsRow | null; error: unknown }>;
          };
        };
      };
    };
  };
  const { data: updatedDraft, error: updateError } = await draftTable
    .update(updateData)
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id)
    .select("*")
    .single();

  if (updateError) {
    console.error("Failed to update draft status", updateError);
    throw updateError;
  }

  if (!updatedDraft) {
    throw new Error("Failed to update draft");
  }

  // Generate and save insights (async, don't wait)
  const tenantId = user.tenant.id;
  import("@/lib/insights/context-builder")
    .then(({ buildInsightContext }) =>
      import("@/lib/insights/generate")
        .then(({ generateInsights }) =>
          import("@/lib/data/insights").then(({ saveInsights }) => {
            // Build context and generate insights
            return buildInsightContext(entry.id, payload.draftId)
              .then((context) => generateInsights(context))
              .then((generatedInsights) => {
                // Combine all insights and set tenant_id and references
                const allInsights = [
                  ...generatedInsights.primary,
                  ...generatedInsights.secondary,
                  ...(generatedInsights.deep_dive || []),
                ].map((insight) => ({
                  ...insight,
                  tenant_id: tenantId,
                  journal_entry_id: entry.id,
                  draft_id: payload.draftId,
                }));
                return saveInsights(allInsights);
              });
          }),
        ),
    )
    .catch((err) => console.error("Failed to generate insights:", err));

  // Populate transaction embedding for RAG (async, don't wait)
  import("@/lib/ai/populate-embeddings")
    .then(({ populateTransactionEmbedding }) =>
      populateTransactionEmbedding({
        tenantId,
        transactionId: entry.id,
        description,
        counterparty: parsedDraft.entities.counterparty ?? null,
        amount: Number(parsedDraft.entities.amount),
        currency: parsedDraft.entities.currency,
        date: parsedDraft.entities.date,
        intent: parsedDraft.intent,
      }),
    )
    .catch((err) => console.error("Failed to populate transaction embedding:", err));

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "draft.posted",
    entity: "drafts",
    entity_id: payload.draftId,
    changes: {
      journal_entry_id: entry.id,
    },
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  try {
    await recordTimelineEvent(supabase, {
      tenantId: user.tenant.id,
      eventType: draftIntentToTimelineEventType(draft.intent),
      referenceType: "journal_entry",
      referenceId: entry.id,
      description: buildDraftPostedTimelineDescription(
        draft.intent,
        parsedDraft.entities as Record<string, unknown>,
        description,
      ),
      eventDate: postingDate,
    });
  } catch (timelineErr) {
    console.error("[postDraft] timeline_event", timelineErr);
  }

  try {
    await materializeInvoiceOrBillFromPostedDraft(supabase, {
      tenantId: user.tenant.id,
      draft,
      journalEntryId: entry.id,
      postingDate,
      description,
      entities: parsedDraft.entities as Record<string, unknown>,
      draftData: draftDataRaw as Record<string, unknown>,
    });
    await materializePaymentFromPostedDraft(supabase, {
      tenantId: user.tenant.id,
      draft,
      journalEntryId: entry.id,
      postingDate,
      entities: parsedDraft.entities as Record<string, unknown>,
      draftData: draftDataRaw as Record<string, unknown>,
    });
  } catch (matErr) {
    console.error("[postDraft] materialize invoice/bill", matErr);
  }

  revalidatePath("/drafts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/timeline");
  revalidatePath("/invoices");
  revalidatePath("/bills");
  revalidatePath("/payments");
  revalidatePath("/inventory");
  revalidatePath("/insights/inventory");
  // Return updated draft for real-time UI updates
  return {
    id: updatedDraft.id,
    status: updatedDraft.status,
    posted_entry_id: updatedDraft.posted_entry_id,
  };
  } catch (err) {
    console.error("[postDraft]", {
      refId,
      tenant_id: user.tenant.id,
      user_id: user.id,
      draft_id: draft.id,
      document_type: draft.intent,
      error: err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    throwWithReference(
      getErrorMessage(err, "Post failed."),
      refId,
      isDev,
      err
    );
  }
}

/**
 * Get journal entry preview for a draft
 * Returns the accounts and journal lines that will be created when the draft is posted
 */
export async function getDraftJournalPreview(draftId: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();
  
  // Get the draft
  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select<"*", DraftsRow>("*")
    .eq("id", draftId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (draftError || !draft) {
    throw new Error("Draft not found.");
  }

  // Get accounts (no manual mapping needed - AI selects accounts automatically)
  const accounts = await listAccounts();

  // Extract AI-selected accounts from data_json if available
  const draftDataRaw = draft.data_json as Record<string, unknown>;
  const draftDataForParse = normalizeDraftDataJsonForParse(draftDataRaw);
  const aiSelectedAccounts = draftDataRaw.ai_selected_accounts as unknown;

  const parsedDraft = DraftSchema.parse({
    intent: draft.intent,
    entities: draftDataForParse,
    confidence: draft.confidence ? Number(draft.confidence) : 0,
    accounts: aiSelectedAccounts ?? undefined,
  });

  const previewLineItems = draftDataRaw.inventory_line_items as
    | Array<{ item_id: string; quantity?: number; unit_price?: number; rate?: number }>
    | undefined;
  const previewSnap = draftDataRaw.item_snapshot as
    | { item_type?: string; inventory_tracked?: boolean }
    | undefined;
  const previewBillPurchase = draftDataRaw.bill_purchase_type as string | undefined;
  if (draftDataRaw.guided_event_requires_item === true && !draftDataRaw.selected_item_id) {
    throw new Error(
      "Please select or create an item so inventory/accounting can be handled correctly.",
    );
  }
  assertInventoryTrackedLineOrThrow(draft.intent, previewBillPurchase, previewSnap, previewLineItems);

  // Check if draft has edited journal lines
  const editedLines = draftDataRaw.edited_journal_lines as
    | Array<{
        account_id: string;
        debit: number;
        credit: number;
        memo: string | null;
        tax_rate_id?: string | null;
      }>
    | undefined;
  const editedDescription = draftDataRaw.edited_description as string | undefined;

  const taxRateIdPreview = (draftDataRaw as { tax?: { tax_rate_id?: string } })?.tax?.tax_rate_id ?? null;
  const draftWithTaxTreatment = draft as DraftsRow & { tax_treatment?: "exclusive" | "inclusive" | null };
  const taxTreatmentPreview = draftWithTaxTreatment.tax_treatment ?? "exclusive";

  if (editedLines && editedLines.length > 0) {
    // Use edited journal lines
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const journalLines = editedLines.map((line) => {
      const account = accountMap.get(line.account_id);
      return {
        account_id: line.account_id,
        account_code: account?.code ?? "",
        account_name: account?.name ?? "",
        account_type: account?.type ?? "",
        debit: line.debit,
        credit: line.credit,
        memo: line.memo,
      };
    });

    return {
      description: editedDescription ?? parsedDraft.entities.description ?? "",
      journalLines,
      entities: parsedDraft.entities,
      intent: parsedDraft.intent,
    };
  }

  // Otherwise, generate journal lines from draft using AI-selected accounts or fallback
  // No manual mapping needed - AI selects accounts automatically
  // Cast to Account[] - buildDefaultJournalLines works with base Account type
  let { description, lines } = await buildDefaultJournalLines(parsedDraft, accounts as Account[], null, {
    tenantId: user.tenant.id,
    tax_treatment: taxTreatmentPreview,
    taxRateId: taxRateIdPreview,
  });

  if (parsedDraft.intent === "create_invoice" && previewLineItems && previewLineItems.length > 0) {
    const first = previewLineItems[0] as {
      item_id?: string;
      cogs_amount?: number | null;
      item_name?: string | null;
    };
    const guidedLine = draftDataRaw.guided_invoice_line as { cogs?: number | null } | undefined;
    const cogsAmtRaw =
      typeof guidedLine?.cogs === "number" && Number.isFinite(guidedLine.cogs)
        ? guidedLine.cogs
        : typeof first.cogs_amount === "number" && Number.isFinite(first.cogs_amount)
          ? first.cogs_amount
          : null;
    if (cogsAmtRaw != null && cogsAmtRaw > 0 && first.item_id) {
      const { getInventoryItem } = await import("@/lib/data/inventory");
      const invItem = await getInventoryItem(first.item_id);
      const cogsId = invItem?.cogs_account_id;
      const invAccId = invItem?.inventory_account_id;
      if (cogsId && invAccId) {
        const amt = Number(cogsAmtRaw.toFixed(2));
        lines = [
          ...lines,
          {
            account_id: cogsId,
            debit: amt,
            credit: 0,
            memo: `COGS (draft preview): ${first.item_name ?? ""}`.trim(),
          },
          {
            account_id: invAccId,
            debit: 0,
            credit: amt,
            memo: "Inventory reduction (draft preview)",
          },
        ];
      }
    }
  }

  // Map journal lines to include account details
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const journalLines = lines.map((line) => {
    const account = accountMap.get(line.account_id);
    return {
      account_id: line.account_id,
      account_code: account?.code ?? "",
      account_name: account?.name ?? "",
      account_type: account?.type ?? "",
      debit: line.debit,
      credit: line.credit,
      memo: line.memo,
    };
  });

  return {
    description,
    journalLines,
    entities: parsedDraft.entities,
    intent: parsedDraft.intent,
  };
}

const UpdateJournalLinesSchema = z.object({
  draftId: z.string().uuid(),
  description: z.string(),
  journalLines: z.array(
    z.object({
      account_id: z.string().uuid(),
      debit: z.number().min(0),
      credit: z.number().min(0),
      memo: z.string().nullable(),
    })
  ),
});

export async function updateDraftJournalLines(input: z.infer<typeof UpdateJournalLinesSchema>) {
  const payload = UpdateJournalLinesSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();
  const { data: existing, error: fetchError } = await supabase
    .from("drafts")
    .select<"id, status, data_json", Pick<DraftsRow, "id" | "status" | "data_json">>("id, status, data_json")
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to load draft for update", fetchError);
    throw fetchError;
  }

  if (!existing) {
    throw new Error("Draft not found.");
  }

  // Allow admin/auditor to edit posted entries with audit log
  if (existing.status === "posted") {
    if (!canEditPosted(user.role as UserRole)) {
      throw new Error("Posted drafts cannot be edited. Only administrators and auditors can edit posted entries.");
    }
    
    // Log the edit to audit log
    const auditData: AuditLogsInsert = {
      tenant_id: user.tenant.id,
      actor_id: user.id,
      action: "edit_posted_journal_lines",
      entity: "draft",
      entity_id: payload.draftId,
      changes: {
        previous_status: existing.status,
        journal_lines_count: payload.journalLines.length,
        reason: "Admin/Auditor edit of posted draft journal lines",
      },
    };

    const auditTable = supabase.from("audit_logs") as unknown as {
      insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
    };
    await auditTable.insert([auditData]);
  }

  // Validate journal lines are balanced
  const totalDebit = payload.journalLines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = payload.journalLines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.abs(totalDebit - totalCredit) >= 0.01) {
    throw new Error(`Journal entry is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`);
  }

  // Store edited journal lines in data_json
  const existingData = existing.data_json as Record<string, unknown>;
  const updatedData = {
    ...existingData,
    edited_journal_lines: payload.journalLines,
    edited_description: payload.description,
  };

  const nextStatus = existing.status === "approved" ? "draft" : existing.status;

  const updateData: DraftsUpdate = {
    data_json: updatedData,
    status: nextStatus,
  };

  const table = supabase.from("drafts") as unknown as {
    update: (values: DraftsUpdate) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ error: unknown }>;
      };
    };
  };
  const { error } = await table.update(updateData).eq("id", payload.draftId).eq("tenant_id", user.tenant.id);

  if (error) {
    console.error("Failed to update draft journal lines", error);
    throw error;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "draft.journal_lines_updated",
    entity: "drafts",
    entity_id: payload.draftId,
    changes: {
      description: payload.description,
      line_count: payload.journalLines.length,
    },
  };
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/drafts");
  return { success: true };
}

const ConvertPostedToDraftSchema = z.object({
  draftId: z.string().uuid(),
  reason: z.string().min(1, "Reason is required for unposting"),
});

/**
 * Convert a posted draft back to draft. Voids the journal entry (excluded from calculations)
 * and reverts the draft. Admin and auditor only.
 */
export async function convertPostedToDraftAction(input: z.infer<typeof ConvertPostedToDraftSchema>) {
  const payload = ConvertPostedToDraftSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const role = user.role as UserRole;
  if (!canEditPosted(role)) {
    throw new Error("Only administrators and auditors can convert posted drafts back to draft.");
  }

  const supabase = await createServerSupabaseClient();

  const { data: draft, error: fetchError } = await supabase
    .from("drafts")
    .select<"id, status, posted_entry_id, tenant_id", Pick<DraftsRow, "id" | "status" | "posted_entry_id" | "tenant_id">>(
      "id, status, posted_entry_id, tenant_id"
    )
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to load draft for convert", fetchError);
    throw fetchError;
  }

  if (!draft) {
    throw new Error("Draft not found.");
  }

  if (draft.status !== "posted") {
    throw new Error("Only posted drafts can be converted back to draft.");
  }

  if (draft.posted_entry_id) {
    // Void the journal entry so it is excluded from all calculations (reports, P&L,
    // trial balance, dashboard) which filter on status = 'posted' only.
    const { error: voidErr } = await supabase
      .from("journal_entries")
      .update({ status: "void" })
      .eq("id", draft.posted_entry_id)
      .eq("tenant_id", user.tenant.id);

    if (voidErr) {
      console.error("Failed to void journal entry", voidErr);
      throw new Error("Failed to void the journal entry. The draft could not be converted.");
    }
  }

  const draftTable = supabase.from("drafts") as unknown as {
    update: (values: DraftsUpdate) => {
      eq: (col: string, val: string) => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
    };
  };
  await draftTable
    .update({
      status: "draft",
      posted_entry_id: null,
      approved_by: null,
      approved_at: null,
    })
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id);

  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([
    {
      tenant_id: user.tenant.id,
      actor_id: user.id,
      action: "draft.unposted",
      entity: "drafts",
      entity_id: payload.draftId,
      changes: { journal_entry_id: draft.posted_entry_id, reason: payload.reason },
    },
  ]);

  revalidatePath("/drafts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return { success: true };
}

const DeleteDraftSchema = z.object({
  draftId: z.string().uuid(),
});

/**
 * Delete a draft. Only allowed for unposted drafts (draft or approved).
 * Posted drafts must be converted to draft first (admin/auditor), then deleted.
 */
export async function deleteDraftAction(input: z.infer<typeof DeleteDraftSchema>) {
  const payload = DeleteDraftSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const role = user.role as UserRole;
  if (!canApprove(role)) {
    throw new Error("You do not have permission to delete drafts.");
  }

  const supabase = await createServerSupabaseClient();

  const { data: draft, error: fetchError } = await supabase
    .from("drafts")
    .select<"id, status, tenant_id", Pick<DraftsRow, "id" | "status" | "tenant_id">>(
      "id, status, tenant_id"
    )
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to load draft for delete", fetchError);
    throw fetchError;
  }

  if (!draft) {
    throw new Error("Draft not found.");
  }

  if (draft.status === "posted") {
    throw new Error("Posted drafts cannot be deleted. Convert to draft first, then delete.");
  }

  const { error: deleteErr } = await supabase
    .from("drafts")
    .delete()
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id);

  if (deleteErr) {
    console.error("Failed to delete draft", deleteErr);
    throw new Error("Failed to delete draft.");
  }

  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([
    {
      tenant_id: user.tenant.id,
      actor_id: user.id,
      action: "draft.deleted",
      entity: "drafts",
      entity_id: payload.draftId,
      changes: { previous_status: draft.status },
    },
  ]);

  revalidatePath("/drafts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return { success: true };
}

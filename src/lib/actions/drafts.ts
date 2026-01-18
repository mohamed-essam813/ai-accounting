"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DraftSchema } from "@/lib/ai/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { listAccounts } from "@/lib/data/accounts";
import { buildDefaultJournalLines, ensureBalanced, type IntentAccountMapping, type JournalLine } from "@/lib/accounting";
import { canApprove, type UserRole } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import type { DraftPayload } from "@/lib/ai/schema";

type DraftsInsert = Database["public"]["Tables"]["drafts"]["Insert"];
type DraftsRow = Database["public"]["Tables"]["drafts"]["Row"];
type DraftsUpdate = Database["public"]["Tables"]["drafts"]["Update"];
type JournalEntriesInsert = Database["public"]["Tables"]["journal_entries"]["Insert"];
type JournalEntriesRow = Database["public"]["Tables"]["journal_entries"]["Row"];
type JournalLinesInsert = Database["public"]["Tables"]["journal_lines"]["Insert"];
type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

const SaveDraftSchema = DraftSchema.extend({
  rawPrompt: z.string().optional(),
  contactId: z.string().uuid().optional().nullable(),
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

  // Store original prompt and AI-selected accounts in data_json
  const dataJson = {
    ...entities,
    original_prompt: (payload as { rawPrompt?: string }).rawPrompt ?? null,
    ai_selected_accounts: payload.accounts ?? null, // Store AI account selections
  };

  // contact_id will be added by migration, using type assertion for now
  const insertData = {
    tenant_id: user.tenant.id,
    intent: payload.intent,
    data_json: dataJson,
    status: "draft",
    created_by: user.id,
    confidence: payload.confidence,
    contact_id: (payload as { contactId?: string | null }).contactId ?? null,
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
  return data;
}

const UpdateDraftSchema = DraftSchema.extend({
  draftId: z.string().uuid(),
});

export async function updateDraftAction(input: z.infer<typeof UpdateDraftSchema>) {
  const payload = UpdateDraftSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();
  const { data: existing, error: fetchError } = await supabase
    .from("drafts")
    .select<"id, status", Pick<DraftsRow, "id" | "status">>("id, status")
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

  if (existing.status === "posted") {
    throw new Error("Posted drafts cannot be edited.");
  }

  const nextStatus = existing.status === "approved" ? "draft" : existing.status;

  // Prevent invoice number changes for invoices - preserve existing invoice number
  const entities = { ...payload.entities };
  if (payload.intent === "create_invoice") {
    // Get existing draft to preserve invoice number
    const { data: existingDraft } = await supabase
      .from("drafts")
      .select("data_json")
      .eq("id", payload.draftId)
      .maybeSingle();
    
    if (existingDraft) {
      const existingData = existingDraft.data_json as { invoice_number?: string | null };
      if (existingData?.invoice_number) {
        entities.invoice_number = existingData.invoice_number;
      } else {
        // Generate if missing
        const { generateInvoiceNumber } = await import("@/lib/utils/invoice-number");
        entities.invoice_number = await generateInvoiceNumber(user.tenant.id);
      }
    }
  }

  const updateData: DraftsUpdate = {
    intent: payload.intent,
    data_json: entities,
    confidence: payload.confidence,
    status: nextStatus,
  };
  // Type assertion to fix Supabase type inference
  const table = supabase.from("drafts") as unknown as {
    update: (values: DraftsUpdate) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ error: unknown }>;
      };
    };
  };
  const { error } = await table.update(updateData).eq("id", payload.draftId).eq("tenant_id", user.tenant.id);

  if (error) {
    console.error("Failed to update draft", error);
    throw error;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "draft.updated",
    entity: "drafts",
    entity_id: payload.draftId,
    changes: {
      intent: payload.intent,
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
  };
  // Type assertion to fix Supabase type inference
  const table = supabase.from("drafts") as unknown as {
    update: (values: DraftsUpdate) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ error: unknown }>;
      };
    };
  };
  const { error } = await table.update(updateData).eq("id", payload.draftId).eq("tenant_id", user.tenant.id);

  if (error) {
    throw error;
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
  return { success: true };
}

const PostDraftSchema = z.object({
  draftId: z.string().uuid(),
});

export async function postDraftAction(input: z.infer<typeof PostDraftSchema>) {
  const payload = PostDraftSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  if (!canApprove(user.role as UserRole)) {
    throw new Error("You do not have permission to post journal entries.");
  }

  const supabase = await createServerSupabaseClient();

  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select<"*", DraftsRow>("*")
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (draftError) {
    throw draftError;
  }

  if (!draft) {
    throw new Error("Draft not found.");
  }

  if (draft.status !== "approved" && draft.status !== "posted") {
    throw new Error("Draft must be approved before posting.");
  }

  if (draft.posted_entry_id) {
    return draft.posted_entry_id;
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
  const draftData = draft.data_json as Record<string, unknown>;
  const editedLines = draftData.edited_journal_lines as
    | Array<{
        account_id: string;
        debit: number;
        credit: number;
        memo: string | null;
      }>
    | undefined;
  const editedDescription = draftData.edited_description as string | undefined;

  // Parse draft first (needed for date extraction)
  // Extract AI-selected accounts from data_json if available
  const aiSelectedAccounts = draftData.ai_selected_accounts as any;
  
  const parsedDraft = DraftSchema.parse({
    intent: draft.intent,
    entities: draft.data_json,
    confidence: draft.confidence ? Number(draft.confidence) : 0,
    accounts: aiSelectedAccounts, // Include AI-selected accounts if available
  });

  let description: string;
  let lines: JournalLine[];

  if (editedLines && editedLines.length > 0) {
    // Use edited journal lines
    description = editedDescription ?? draftData.description as string ?? "";
    lines = editedLines.map((line) => ({
      account_id: line.account_id,
      debit: Number(line.debit),
      credit: Number(line.credit),
      memo: line.memo ?? null,
    }));
  } else {
    // Generate journal lines from draft using AI-selected accounts or fallback
    // No manual mapping needed - AI selects accounts automatically
    const result = await buildDefaultJournalLines(parsedDraft, allAccounts, null, {
      tenantId: user.tenant.id,
    });
    description = result.description;
    lines = result.lines;
  }

  if (lines.length === 0) {
    throw new Error("No journal lines generated for draft.");
  }

  // Extract inventory line items from draft if present
  const inventoryLineItems = draftData.inventory_line_items as
    | Array<{
        item_id: string;
        item_name: string;
        quantity: number;
        rate: number;
        discount: number;
        tax_rate: number;
        tax_amount: number;
        total: number;
      }>
    | undefined;

  // Process inventory items for invoices (sales) and bills (purchases)
  const inventoryTransactionIds: string[] = [];
  
  if (inventoryLineItems && inventoryLineItems.length > 0) {
    if (draft.intent === "create_invoice") {
      // SALES: Process inventory items for sale
      // For each item: Calculate COGS, create inventory transaction, add COGS journal line
      const { calculateCOGSFIFO, calculateCOGSWeightedAverage } = await import("@/lib/inventory/valuation");
      const { updateInventoryBalanceAfterSale } = await import("@/lib/inventory/valuation");
      const { getInventoryBalance } = await import("@/lib/data/inventory");
      const { getAccountByCode } = await import("@/lib/data/accounts");

      // Get COGS account (code 5500)
      const cogsAccount = await getAccountByCode("5500");
      if (!cogsAccount) {
        throw new Error("COGS account (5500) not found. Please create it in Chart of Accounts.");
      }

      // Get Inventory account (code 1200)
      const inventoryAccount = await getAccountByCode("1200");
      if (!inventoryAccount) {
        throw new Error("Inventory account (1200) not found. Please create it in Chart of Accounts.");
      }

      const entryDate = (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10);

      for (const lineItem of inventoryLineItems) {
        // Get inventory item to determine valuation method
        const { getInventoryItem } = await import("@/lib/data/inventory");
        const inventoryItem = await getInventoryItem(lineItem.item_id);
        if (!inventoryItem) {
          throw new Error(`Inventory item ${lineItem.item_id} not found`);
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
        const invTransactionTable = supabase.from("inventory_transactions" as any) as unknown as {
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

          // Add COGS journal line: DR COGS, CR Inventory
          lines.push({
            account_id: cogsAccount.id,
            debit: cogsAmount,
            credit: 0,
            memo: `COGS: ${lineItem.item_name} (${lineItem.quantity})`,
          });

          lines.push({
            account_id: inventoryAccount.id,
            debit: 0,
            credit: cogsAmount,
            memo: `Inventory: ${lineItem.item_name} (${lineItem.quantity})`,
          });
        }
      }
    } else if (draft.intent === "create_bill") {
      // PURCHASES: Process inventory items for purchase
      // For each item: Create inventory transaction, update balance, add inventory journal line
      const { updateInventoryBalanceAfterPurchase } = await import("@/lib/inventory/valuation");
      const { getInventoryItem } = await import("@/lib/data/inventory");
      const { getAccountByCode } = await import("@/lib/data/accounts");

      // Get Inventory account (code 1200)
      const inventoryAccount = await getAccountByCode("1200");
      if (!inventoryAccount) {
        throw new Error("Inventory account (1200) not found. Please create it in Chart of Accounts.");
      }

      const entryDate = (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10);

      for (const lineItem of inventoryLineItems) {
        // Get inventory item to determine valuation method and unit cost
        const inventoryItem = await getInventoryItem(lineItem.item_id);
        if (!inventoryItem) {
          throw new Error(`Inventory item ${lineItem.item_id} not found`);
        }

        // For purchases, unit_cost is the rate (purchase price per unit)
        const unitCost = lineItem.rate;
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
        const invTransactionTable = supabase.from("inventory_transactions" as any) as unknown as {
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

          // Add Inventory journal line: DR Inventory
          // Note: The CR side (AP) is already handled by the default bill journal lines
          // We just need to modify the expense line to be inventory
          // Find the expense line and replace it with inventory
          const expenseLineIndex = lines.findIndex(
            (line) => line.debit > 0 && line.credit === 0 && line.account_id !== inventoryAccount.id
          );
          
          if (expenseLineIndex >= 0) {
            // Replace expense line with inventory line for this item
            lines[expenseLineIndex] = {
              account_id: inventoryAccount.id,
              debit: totalCost,
              credit: 0,
              memo: `Inventory Purchase: ${lineItem.item_name} (${lineItem.quantity})`,
            };
          } else {
            // Add inventory line if no expense line found
            lines.push({
              account_id: inventoryAccount.id,
              debit: totalCost,
              credit: 0,
              memo: `Inventory Purchase: ${lineItem.item_name} (${lineItem.quantity})`,
            });
          }
        }
      }

      // Re-balance the journal entry (adjust credit side if needed)
      // This handles cases where inventory purchase total differs from bill amount
    }
  }

  ensureBalanced(lines);

  // Get contact_id from draft if available (will be available after migration)
  const draftContactId = (draft as { contact_id?: string | null }).contact_id;

  // Extract currency information from draft entities
  const draftEntities = parsedDraft.entities as Record<string, unknown>;
  const transactionCurrency = (draftEntities.currency as string) || null;
  const transactionAmount = typeof draftEntities.amount === "number" ? draftEntities.amount : null;
  
  // Get tenant base currency (default to USD for MVP, should be configurable per tenant)
  // TODO: Fetch from tenant settings when available
  const baseCurrency = "USD"; // Default base currency
  
  // Calculate FX rate and base amount
  let fxRate: number | null = null;
  let amountInBaseCurrency: number | null = null;
  
  if (transactionCurrency && transactionAmount !== null) {
    if (transactionCurrency.toUpperCase() === baseCurrency.toUpperCase()) {
      // Same currency, no conversion needed
      fxRate = 1.0;
      amountInBaseCurrency = transactionAmount;
    } else {
      // Different currency - for MVP, default to 1.0 (should fetch from FX service)
      // TODO: Integrate with FX rate service or tenant FX rate settings
      fxRate = 1.0; // Default 1:1 for MVP
      amountInBaseCurrency = transactionAmount * fxRate;
    }
  }

  // contact_id and currency fields will be added by migration, using type assertion for now
  const entryData = {
    tenant_id: user.tenant.id,
    date: (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10),
    description,
    status: "posted",
    created_by: user.id,
    approved_by: user.id,
    posted_at: new Date().toISOString(),
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

  try {
    const linesData: JournalLinesInsert[] = lines.map((line) => ({
      entry_id: entry?.id ?? "",
      account_id: line.account_id,
      memo: line.memo ?? null,
      debit: Number(line.debit),
      credit: Number(line.credit),
    }));
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

  // Update draft to mark as posted
  const updateData: DraftsUpdate = {
    status: "posted",
    posted_entry_id: entry.id,
  };
  // Type assertion to fix Supabase type inference
  const draftTable = supabase.from("drafts") as unknown as {
    update: (values: DraftsUpdate) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ error: unknown }>;
      };
    };
  };
  await draftTable.update(updateData).eq("id", payload.draftId).eq("tenant_id", user.tenant.id);

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

  revalidatePath("/drafts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return entry.id;
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
  const draftData = draft.data_json as Record<string, unknown>;
  const aiSelectedAccounts = draftData.ai_selected_accounts as any;

  const parsedDraft = DraftSchema.parse({
    intent: draft.intent,
    entities: draft.data_json,
    confidence: draft.confidence ? Number(draft.confidence) : 0,
    accounts: aiSelectedAccounts, // Include AI-selected accounts if available
  });

  // Check if draft has edited journal lines
  const editedLines = draftData.edited_journal_lines as
    | Array<{
        account_id: string;
        debit: number;
        credit: number;
        memo: string | null;
      }>
    | undefined;
  const editedDescription = draftData.edited_description as string | undefined;

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
  const { description, lines } = await buildDefaultJournalLines(parsedDraft, accounts, null, {
    tenantId: user.tenant.id,
  });

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

  if (existing.status === "posted") {
    throw new Error("Posted drafts cannot be edited.");
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

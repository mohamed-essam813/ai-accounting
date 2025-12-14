"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DraftSchema } from "@/lib/ai/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { listAccounts } from "@/lib/data/accounts";
import { buildDefaultJournalLines, ensureBalanced, type IntentAccountMapping } from "@/lib/accounting";
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

  // Store original prompt in data_json for RAG-based account selection
  const dataJson = {
    ...entities,
    original_prompt: (payload as { rawPrompt?: string }).rawPrompt ?? null,
  };

  const insertData: DraftsInsert = {
    tenant_id: user.tenant.id,
    intent: payload.intent,
    data_json: dataJson,
    status: "draft",
    created_by: user.id,
    confidence: payload.confidence,
  };
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

  // Ensure default accounts exist before posting
  const { ensureDefaultAccounts } = await import("@/lib/data/accounts");
  try {
    await ensureDefaultAccounts(user.tenant.id);
  } catch (error) {
    console.warn("Failed to ensure default accounts (continuing anyway):", error);
  }

  const accounts = await listAccounts();
  
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
    // Generate journal lines from draft
    type IntentMappingRow = Database["public"]["Tables"]["intent_account_mappings"]["Row"];
    const { data: mapping } = await supabase
      .from("intent_account_mappings")
      .select<"*", IntentMappingRow>("*")
      .eq("tenant_id", user.tenant.id)
      .eq("intent", draft.intent)
      .maybeSingle();
    const parsedDraft = DraftSchema.parse({
      intent: draft.intent,
      entities: draft.data_json,
      confidence: draft.confidence ? Number(draft.confidence) : 0,
    });

    // Convert database mapping to IntentAccountMapping type, casting intent to the correct enum type
    const intentMapping = mapping
      ? ({
          intent: mapping.intent as DraftPayload["intent"],
          debit_account_id: mapping.debit_account_id,
          credit_account_id: mapping.credit_account_id,
          tax_debit_account_id: mapping.tax_debit_account_id,
          tax_credit_account_id: mapping.tax_credit_account_id,
        } as IntentAccountMapping)
      : undefined;

    // Try to get original prompt from draft data for RAG-based account selection
    const originalPrompt = (draft.data_json as { original_prompt?: string })?.original_prompt;
    
    const result = await buildDefaultJournalLines(parsedDraft, accounts, intentMapping, {
      prompt: originalPrompt,
      tenantId: user.tenant.id,
      useRAG: true, // Enable RAG-based dynamic account selection
    });
    description = result.description;
    lines = result.lines;
  }

  if (lines.length === 0) {
    throw new Error("No journal lines generated for draft.");
  }

  ensureBalanced(lines);

  const entryData: JournalEntriesInsert = {
    tenant_id: user.tenant.id,
    date: (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10),
    description,
    status: "posted",
    created_by: user.id,
    approved_by: user.id,
    posted_at: new Date().toISOString(),
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

  // Populate transaction embedding for RAG (async, don't wait)
  const tenantId = user.tenant.id;
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

  // Get accounts and mapping
  const accounts = await listAccounts();
  type IntentMappingRow = Database["public"]["Tables"]["intent_account_mappings"]["Row"];
  const { data: mapping } = await supabase
    .from("intent_account_mappings")
    .select<"*", IntentMappingRow>("*")
    .eq("tenant_id", user.tenant.id)
    .eq("intent", draft.intent)
    .maybeSingle();

  const parsedDraft = DraftSchema.parse({
    intent: draft.intent,
    entities: draft.data_json,
    confidence: draft.confidence ? Number(draft.confidence) : 0,
  });

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

  // Otherwise, generate journal lines from draft
  const intentMapping = mapping
    ? ({
        intent: mapping.intent as DraftPayload["intent"],
        debit_account_id: mapping.debit_account_id,
        credit_account_id: mapping.credit_account_id,
        tax_debit_account_id: mapping.tax_debit_account_id,
        tax_credit_account_id: mapping.tax_credit_account_id,
      } as IntentAccountMapping)
    : undefined;

  // Try to get original prompt from draft data for RAG-based account selection
  const originalPrompt = (draft.data_json as { original_prompt?: string })?.original_prompt;
  
  const { description, lines } = await buildDefaultJournalLines(parsedDraft, accounts, intentMapping, {
    prompt: originalPrompt,
    tenantId: user.tenant.id,
    useRAG: true, // Enable RAG-based dynamic account selection
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

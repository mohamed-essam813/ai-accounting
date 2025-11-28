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

  const insertData: DraftsInsert = {
    tenant_id: user.tenant.id,
    intent: payload.intent,
    data_json: payload.entities,
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

  const updateData: DraftsUpdate = {
    intent: payload.intent,
    data_json: payload.entities,
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
  const { error: updateError } = await table.update(updateData).eq("id", payload.draftId).eq("tenant_id", user.tenant.id);

  if (updateError) {
    console.error("Failed to update draft", updateError);
    throw updateError;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "draft.updated",
    entity: "drafts",
    entity_id: payload.draftId,
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
}

const ApprovePayload = z.object({
  draftId: z.string().uuid(),
  adjustments: z
    .object({
      description: z.string().optional(),
      amount: z.number().optional(),
    })
    .optional(),
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
        eq: (column: string, value: string) => Promise<{ error: unknown }>;
      };
    };
  };
  const { error } = await table.update(updateData).eq("id", payload.draftId).eq("tenant_id", user.tenant.id);

  if (error) {
    console.error("Draft approval failed", error);
    throw error;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "draft.approved",
    entity: "drafts",
    entity_id: payload.draftId,
    changes: payload.adjustments ?? null,
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/drafts");
  revalidatePath("/dashboard");
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

  const { description, lines } = buildDefaultJournalLines(parsedDraft, accounts, intentMapping);

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
    console.error("Failed to create journal entry", entryError);
    throw entryError;
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
    const { error: lineError } = await linesTable.insert(linesData);

    if (lineError) {
      throw lineError;
    }
  } catch (lineError) {
    await supabase.from("journal_entries").delete().eq("id", entry?.id ?? "");
    throw lineError;
  }

  const updateData: DraftsUpdate = {
    status: "posted",
    posted_entry_id: entry?.id ?? null,
  };
  // Type assertion to fix Supabase type inference
  const draftTable = supabase.from("drafts") as unknown as {
    update: (values: DraftsUpdate) => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>;
    };
  };
  const { error: draftUpdateError } = await draftTable.update(updateData).eq("id", draft.id);

  if (draftUpdateError) {
    throw draftUpdateError;
  }

  // Populate embedding for RAG (async, don't wait)
  if (entry) {
    const entities = parsedDraft.entities;
    const tenantId = user.tenant.id;
    import("@/lib/ai/populate-embeddings")
      .then(({ populateTransactionEmbedding }) =>
        populateTransactionEmbedding({
          tenantId,
          transactionId: entry.id,
          description: description ?? "",
          counterparty: (entities.counterparty as string | undefined) ?? null,
          amount: (entities.amount as number) ?? 0,
          currency: (entities.currency as string) ?? "USD",
          date: entry.date,
          intent: draft.intent,
        }),
      )
      .catch((err) => console.error("Failed to populate transaction embedding:", err));
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "journal.posted",
    entity: "journal_entries",
    entity_id: entry?.id ?? null,
    changes: {
      draftId: draft.id,
      lines: lines.length,
    },
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/drafts");
  revalidatePath("/dashboard");
  revalidatePath("/reports/pnl");
  return entry?.id ?? null;
}


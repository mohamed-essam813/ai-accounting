"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DraftSchema } from "@/lib/ai/schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { listAccounts } from "@/lib/data/accounts";
import { buildDefaultJournalLines, ensureBalanced } from "@/lib/accounting";
import { canApprove } from "@/lib/auth";

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

  const { data, error } = await supabase
    .from("drafts")
    .insert({
      tenant_id: user.tenant.id,
      intent: payload.intent,
      data_json: payload.entities,
      status: "draft",
      created_by: user.id,
      confidence: payload.confidence,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to persist draft", error);
    throw error;
  }

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "draft.created",
    entity: "drafts",
    entity_id: data?.id ?? null,
    changes: {
      intent: payload.intent,
      confidence: payload.confidence,
    },
  });

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
    .select("id, status")
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

  const { error: updateError } = await supabase
    .from("drafts")
    .update({
      intent: payload.intent,
      data_json: payload.entities,
      confidence: payload.confidence,
      status: nextStatus,
    })
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id);

  if (updateError) {
    console.error("Failed to update draft", updateError);
    throw updateError;
  }

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "draft.updated",
    entity: "drafts",
    entity_id: payload.draftId,
    changes: {
      intent: payload.intent,
      confidence: payload.confidence,
    },
  });

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

  if (!canApprove(user.role)) {
    throw new Error("You do not have permission to approve drafts.");
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("drafts")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", payload.draftId)
    .eq("tenant_id", user.tenant.id);

  if (error) {
    console.error("Draft approval failed", error);
    throw error;
  }

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "draft.approved",
    entity: "drafts",
    entity_id: payload.draftId,
    changes: payload.adjustments ?? null,
  });

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

  if (!canApprove(user.role)) {
    throw new Error("You do not have permission to post journal entries.");
  }

  const supabase = await createServerSupabaseClient();
  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("*")
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
  const { data: mapping } = await supabase
    .from("intent_account_mappings")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("intent", draft.intent)
    .maybeSingle();
  const parsedDraft = DraftSchema.parse({
    intent: draft.intent,
    entities: draft.data_json,
    confidence: draft.confidence ?? 0,
  });

  const { description, lines } = buildDefaultJournalLines(parsedDraft, accounts, mapping ?? undefined);

  if (lines.length === 0) {
    throw new Error("No journal lines generated for draft.");
  }

  ensureBalanced(lines);

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert({
      tenant_id: user.tenant.id,
      date: (parsedDraft.entities.date as string) ?? new Date().toISOString().slice(0, 10),
      description,
      status: "posted",
      created_by: user.id,
      approved_by: user.id,
      posted_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();

  if (entryError) {
    console.error("Failed to create journal entry", entryError);
    throw entryError;
  }

  try {
    const { error: lineError } = await supabase.from("journal_lines").insert(
      lines.map((line) => ({
        entry_id: entry?.id,
        account_id: line.account_id,
        memo: line.memo ?? null,
        debit: line.debit,
        credit: line.credit,
      })),
    );

    if (lineError) {
      throw lineError;
    }
  } catch (lineError) {
    await supabase.from("journal_entries").delete().eq("id", entry?.id ?? "");
    throw lineError;
  }

  const { error: draftUpdateError } = await supabase
    .from("drafts")
    .update({
      status: "posted",
      posted_entry_id: entry?.id ?? null,
    })
    .eq("id", draft.id);

  if (draftUpdateError) {
    throw draftUpdateError;
  }

  // Populate embedding for RAG (async, don't wait)
  if (entry) {
    const entities = parsedDraft.entities;
    import("@/lib/ai/populate-embeddings")
      .then(({ populateTransactionEmbedding }) =>
        populateTransactionEmbedding({
          tenantId: user.tenant.id,
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

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "journal.posted",
    entity: "journal_entries",
    entity_id: entry?.id ?? null,
    changes: {
      draftId: draft.id,
      lines: lines.length,
    },
  });

  revalidatePath("/drafts");
  revalidatePath("/dashboard");
  revalidatePath("/reports/pnl");
  return entry?.id ?? null;
}


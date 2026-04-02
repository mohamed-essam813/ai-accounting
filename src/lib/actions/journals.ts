"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { listAccounts } from "@/lib/data/accounts";
import { ensureBalanced, type JournalLine } from "@/lib/accounting";
import { canApprove, type UserRole } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { assertPostingDateAllowed } from "@/lib/accounting/period-lock";
import { recordTimelineEvent } from "@/lib/data/timeline";
import { subledgerContactIdForLine } from "@/lib/accounting/ar-ap-subledger";

type JournalEntriesInsert = Database["public"]["Tables"]["journal_entries"]["Insert"];
type JournalEntriesRow = Database["public"]["Tables"]["journal_entries"]["Row"];
type JournalEntriesUpdate = Database["public"]["Tables"]["journal_entries"]["Update"];
type JournalLinesInsert = Database["public"]["Tables"]["journal_lines"]["Insert"];
type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

const JournalLineSchema = z.object({
  account_id: z.string().uuid(),
  debit: z.number().min(0),
  credit: z.number().min(0),
  memo: z.string().nullable().optional(),
  tax_rate_id: z.string().uuid().nullable().optional(),
});

const CreateJournalEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  description: z.string().min(1, "Description is required"),
  lines: z
    .array(JournalLineSchema)
    .min(2, "At least 2 journal lines are required (debit and credit)")
    .refine(
      (lines) => {
        const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
        const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
        return Math.abs(totalDebit - totalCredit) < 0.01; // Allow small floating point differences
      },
      { message: "Journal entry must be balanced (total debit = total credit)" },
    ),
});

export type CreateJournalOptions = {
  postImmediately?: boolean;
  sourceModule?: string;
  /** When set, stored on journal entry and on AR/AP lines only (open-item / statement of account). */
  counterpartyContactId?: string | null;
};

/** Manual journals created as draft by default. System journals (depreciation, disposal) use postImmediately. */
export async function createJournalEntryAction(
  input: z.infer<typeof CreateJournalEntrySchema>,
  options?: CreateJournalOptions,
) {
  const postImmediately = options?.postImmediately ?? false;
  const sourceModule =
    options?.sourceModule ?? (postImmediately ? "system" : "manual_journal");
  const payload = CreateJournalEntrySchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();
  const accounts = await listAccounts();

  // Convert to JournalLine format and validate
  const journalLines: JournalLine[] = payload.lines.map((line) => ({
    account_id: line.account_id,
    debit: Number(line.debit.toFixed(2)),
    credit: Number(line.credit.toFixed(2)),
    memo: line.memo ?? null,
    tax_rate_id: line.tax_rate_id ?? null,
  }));

  ensureBalanced(journalLines);

  if (postImmediately) {
    await assertPostingDateAllowed(supabase, user.tenant.id, payload.date);
  }

  const counterpartyId = options?.counterpartyContactId ?? null;
  const entryData = {
    tenant_id: user.tenant.id,
    date: payload.date,
    description: payload.description,
    status: postImmediately ? "posted" : "draft",
    created_by: user.id,
    approved_by: postImmediately ? user.id : null,
    posted_at: postImmediately ? new Date().toISOString() : null,
    source_module: sourceModule,
    contact_id: counterpartyId,
  } as JournalEntriesInsert & { contact_id?: string | null };

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

  const accountById = new Map(
    accounts.map((a) => [a.id, a as { code: string; prd_account_kind?: string | null }]),
  );
  // Create journal lines
  const linesData: JournalLinesInsert[] = journalLines.map((line) => {
    const acc = accountById.get(line.account_id);
    const contactForLine = subledgerContactIdForLine(
      { prd_account_kind: acc?.prd_account_kind ?? null, code: acc?.code ?? "" },
      counterpartyId,
    );
    return {
      entry_id: entry.id,
      account_id: line.account_id,
      memo: line.memo,
      debit: line.debit,
      credit: line.credit,
      tax_rate_id: line.tax_rate_id ?? null,
      account_source: line.tax_rate_id ? "tax" : "user_override",
      reference_type: "manual_journal",
      reference_id: entry.id,
      contact_id: contactForLine,
    };
  });

  const linesTable = supabase.from("journal_lines") as unknown as {
    insert: (values: JournalLinesInsert[]) => Promise<{ error: unknown }>;
  };
  const { error: linesError } = await linesTable.insert(linesData);

  if (linesError) {
    // Rollback entry creation
    await supabase.from("journal_entries").delete().eq("id", entry.id);
    throw linesError;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "journal.created",
    entity: "journal_entries",
    entity_id: entry.id,
    changes: {
      description: payload.description,
      date: payload.date,
      line_count: payload.lines.length,
      status: postImmediately ? "posted" : "draft",
    },
  };
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  if (postImmediately) {
    try {
      await recordTimelineEvent(supabase, {
        tenantId: user.tenant.id,
        eventType: "journal_posted",
        referenceType: "journal_entry",
        referenceId: entry.id,
        description: payload.description,
        eventDate: payload.date,
      });
    } catch (e) {
      console.error("[createJournalEntry] timeline_event", e);
    }
    const tenantId = user.tenant.id;
    import("@/lib/insights/context-builder")
      .then(({ buildInsightContext }) =>
        import("@/lib/insights/generate")
          .then(({ generateInsights }) =>
            import("@/lib/data/insights").then(({ saveInsights }) =>
              buildInsightContext(entry.id)
                .then((context) => generateInsights(context))
                .then((generatedInsights) => {
                  const allInsights = [
                    ...(generatedInsights.primary ?? []),
                    ...(generatedInsights.secondary ?? []),
                    ...(generatedInsights.deep_dive ?? []),
                  ].map((insight) => ({
                    ...insight,
                    tenant_id: tenantId,
                    journal_entry_id: entry.id,
                  }));
                  return saveInsights(allInsights);
                }),
            ),
        ),
    )
      .catch((err) => console.error("Failed to generate insights:", err));
  }

  revalidatePath("/journals");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath("/timeline");
  return entry.id;
}

const EntryIdSchema = z.object({ entryId: z.string().uuid() });

/**
 * First approval step: draft → approved (PRD Draft / Approved / Posted).
 */
export async function approveJournalEntryAction(input: z.infer<typeof EntryIdSchema>) {
  const { entryId } = EntryIdSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  if (!canApprove(user.role as UserRole)) {
    throw new Error("Only administrators and accountants can approve journal entries.");
  }

  const supabase = await createServerSupabaseClient();
  const { data: entry, error: fetchErr } = await supabase
    .from("journal_entries")
    .select("id, tenant_id, status")
    .eq("id", entryId)
    .eq("tenant_id", user.tenant.id)
    .single();

  if (fetchErr || !entry) throw new Error("Journal entry not found.");
  if (entry.status !== "draft") {
    throw new Error("Only draft entries can be approved.");
  }

  const updateData: JournalEntriesUpdate = {
    status: "approved",
    approved_by: user.id,
  };
  const { error: updateErr } = await supabase
    .from("journal_entries")
    .update(updateData)
    .eq("id", entryId)
    .eq("tenant_id", user.tenant.id);

  if (updateErr) throw updateErr;

  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<{ error: unknown }> }).insert([
    {
      tenant_id: user.tenant.id,
      actor_id: user.id,
      action: "journal.approved_step",
      entity: "journal_entries",
      entity_id: entryId,
      changes: { status: "approved" },
    },
  ]);

  revalidatePath("/journals");
  return { id: entryId, status: "approved" as const };
}

/**
 * Post approved journal to the ledger. Period lock enforced here.
 */
export async function postJournalEntryAction(input: z.infer<typeof EntryIdSchema>) {
  const { entryId } = EntryIdSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  if (!canApprove(user.role as UserRole)) {
    throw new Error("Only administrators and accountants can post journal entries.");
  }

  const supabase = await createServerSupabaseClient();
  const { data: entry, error: fetchErr } = await supabase
    .from("journal_entries")
    .select("id, tenant_id, status, date, description")
    .eq("id", entryId)
    .eq("tenant_id", user.tenant.id)
    .single();

  if (fetchErr || !entry) {
    throw new Error("Journal entry not found.");
  }
  if (entry.status !== "approved") {
    throw new Error("Only approved entries can be posted to the ledger.");
  }

  await assertPostingDateAllowed(supabase, user.tenant.id, entry.date);

  const updateData: JournalEntriesUpdate = {
    status: "posted",
    posted_at: new Date().toISOString(),
  };
  const { error: updateErr } = await supabase
    .from("journal_entries")
    .update(updateData)
    .eq("id", entryId)
    .eq("tenant_id", user.tenant.id);

  if (updateErr) throw updateErr;

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "journal.posted",
    entity: "journal_entries",
    entity_id: entryId,
    changes: { posted_at: updateData.posted_at },
  };
  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<{ error: unknown }> }).insert([auditData]);

  try {
    await recordTimelineEvent(supabase, {
      tenantId: user.tenant.id,
      eventType: "manual_journal_posted",
      referenceType: "journal_entry",
      referenceId: entryId,
      description: entry.description,
      eventDate: entry.date,
    });
  } catch (e) {
    console.error("[postJournal] timeline_event", e);
  }

  const tenantId = user.tenant.id;
  import("@/lib/insights/context-builder")
    .then(({ buildInsightContext }) =>
      import("@/lib/insights/generate")
        .then(({ generateInsights }) =>
          import("@/lib/data/insights").then(({ saveInsights }) =>
            buildInsightContext(entryId)
              .then((context) => generateInsights(context))
              .then((generatedInsights) => {
                const allInsights = [
                  ...(generatedInsights.primary ?? []),
                  ...(generatedInsights.secondary ?? []),
                  ...(generatedInsights.deep_dive ?? []),
                ].map((insight) => ({
                  ...insight,
                  tenant_id: tenantId,
                  journal_entry_id: entryId,
                }));
                return saveInsights(allInsights);
              }),
          ),
        ),
    )
    .catch((err) => console.error("Failed to generate insights:", err));

  revalidatePath("/journals");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath("/timeline");
  return { id: entryId, status: "posted" as const };
}

const UpdateJournalEntrySchema = CreateJournalEntrySchema.extend({
  entryId: z.string().uuid(),
});

/**
 * Update draft journal entry. Only drafts; posted entries are immutable.
 */
export async function updateJournalEntryAction(
  input: z.infer<typeof UpdateJournalEntrySchema>,
) {
  const payload = UpdateJournalEntrySchema.parse(input);
  const { entryId, ...rest } = payload;
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");

  const journalLines: JournalLine[] = rest.lines.map((line) => ({
    account_id: line.account_id,
    debit: Number(line.debit.toFixed(2)),
    credit: Number(line.credit.toFixed(2)),
    memo: line.memo ?? null,
    tax_rate_id: line.tax_rate_id ?? null,
  }));
  ensureBalanced(journalLines);

  const supabase = await createServerSupabaseClient();
  const { data: entry, error: fetchErr } = await supabase
    .from("journal_entries")
    .select("id, tenant_id, status")
    .eq("id", entryId)
    .eq("tenant_id", user.tenant.id)
    .single();

  if (fetchErr || !entry) throw new Error("Journal entry not found.");
  if (entry.status !== "draft") {
    throw new Error("Only draft entries can be edited. Posted entries are immutable.");
  }

  const { error: delLinesErr } = await supabase.from("journal_lines").delete().eq("entry_id", entryId);
  if (delLinesErr) throw delLinesErr;

  const { error: updateErr } = await supabase
    .from("journal_entries")
    .update({ date: rest.date, description: rest.description })
    .eq("id", entryId)
    .eq("tenant_id", user.tenant.id);

  if (updateErr) throw updateErr;

  const linesData: JournalLinesInsert[] = journalLines.map((line) => ({
    entry_id: entryId,
    account_id: line.account_id,
    memo: line.memo,
    debit: line.debit,
    credit: line.credit,
    tax_rate_id: line.tax_rate_id ?? null,
  }));
  const { error: insErr } = await supabase.from("journal_lines").insert(linesData);
  if (insErr) throw insErr;

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "journal.updated",
    entity: "journal_entries",
    entity_id: entryId,
    changes: { description: rest.description, date: rest.date, line_count: rest.lines.length },
  };
  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<{ error: unknown }> }).insert([auditData]);

  revalidatePath("/journals");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  return { id: entryId, status: "draft" as const };
}

const DeleteSchema = z.object({ entryId: z.string().uuid() });

/**
 * Delete draft journal entry. Only drafts; posted entries cannot be deleted.
 */
export async function deleteJournalEntryAction(input: z.infer<typeof DeleteSchema>) {
  const { entryId } = DeleteSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");

  const supabase = await createServerSupabaseClient();
  const { data: entry, error: fetchErr } = await supabase
    .from("journal_entries")
    .select("id, tenant_id, status")
    .eq("id", entryId)
    .eq("tenant_id", user.tenant.id)
    .single();

  if (fetchErr || !entry) throw new Error("Journal entry not found.");
  if (entry.status !== "draft") {
    throw new Error("Only draft entries can be deleted. Posted entries are immutable.");
  }

  await supabase.from("journal_lines").delete().eq("entry_id", entryId);
  const { error: delErr } = await supabase
    .from("journal_entries")
    .delete()
    .eq("id", entryId)
    .eq("tenant_id", user.tenant.id);

  if (delErr) throw delErr;

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "journal.deleted",
    entity: "journal_entries",
    entity_id: entryId,
    changes: { deleted: true },
  };
  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<{ error: unknown }> }).insert([auditData]);

  revalidatePath("/journals");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  return { deleted: true };
}


"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { listAccounts } from "@/lib/data/accounts";
import { ensureBalanced, type JournalLine } from "@/lib/accounting";
import { canApprove, type UserRole } from "@/lib/auth";
import type { Database } from "@/lib/database.types";

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

export type CreateJournalOptions = { postImmediately?: boolean };

/** Manual journals created as draft by default. System journals (depreciation, disposal) use postImmediately. */
export async function createJournalEntryAction(
  input: z.infer<typeof CreateJournalEntrySchema>,
  options?: CreateJournalOptions,
) {
  const postImmediately = options?.postImmediately ?? false;
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
  }));

  ensureBalanced(journalLines);

  const entryData: JournalEntriesInsert = {
    tenant_id: user.tenant.id,
    date: payload.date,
    description: payload.description,
    status: postImmediately ? "posted" : "draft",
    created_by: user.id,
    approved_by: postImmediately ? user.id : null,
    posted_at: postImmediately ? new Date().toISOString() : null,
  };

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

  // Create journal lines
  const linesData: JournalLinesInsert[] = journalLines.map((line) => ({
    entry_id: entry.id,
    account_id: line.account_id,
    memo: line.memo,
    debit: line.debit,
    credit: line.credit,
  }));

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
  return entry.id;
}

const ApproveSchema = z.object({ entryId: z.string().uuid() });

/**
 * Approve draft journal entry and post. Admin/accountant only.
 * Insights are generated after post.
 */
export async function approveAndPostJournalEntryAction(
  input: z.infer<typeof ApproveSchema>,
) {
  const { entryId } = ApproveSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("User tenant not resolved.");
  if (!canApprove(user.role as UserRole)) {
    throw new Error("Only administrators and accountants can approve and post journal entries.");
  }

  const supabase = await createServerSupabaseClient();
  const { data: entry, error: fetchErr } = await supabase
    .from("journal_entries")
    .select("id, tenant_id, status")
    .eq("id", entryId)
    .eq("tenant_id", user.tenant.id)
    .single();

  if (fetchErr || !entry) {
    throw new Error("Journal entry not found.");
  }
  if (entry.status !== "draft") {
    throw new Error("Only draft entries can be approved and posted.");
  }

  const updateData: JournalEntriesUpdate = {
    status: "posted",
    approved_by: user.id,
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
    action: "journal.approved",
    entity: "journal_entries",
    entity_id: entryId,
    changes: { approved_by: user.id, posted_at: updateData.posted_at },
  };
  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<{ error: unknown }> }).insert([auditData]);

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


"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { listAccounts } from "@/lib/data/accounts";
import { ensureBalanced, type JournalLine } from "@/lib/accounting";
import type { Database } from "@/lib/database.types";

type JournalEntriesInsert = Database["public"]["Tables"]["journal_entries"]["Insert"];
type JournalEntriesRow = Database["public"]["Tables"]["journal_entries"]["Row"];
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

export async function createJournalEntryAction(
  input: z.infer<typeof CreateJournalEntrySchema>,
) {
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

  // Create journal entry
  const entryData: JournalEntriesInsert = {
    tenant_id: user.tenant.id,
    date: payload.date,
    description: payload.description,
    status: "posted", // Manual journals are posted immediately
    created_by: user.id,
    approved_by: user.id,
    posted_at: new Date().toISOString(),
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

  // Log audit
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
    },
  };
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  // Generate and save insights (async, don't wait)
  import("@/lib/insights/context-builder")
    .then(({ buildInsightContext }) =>
      import("@/lib/insights/generate")
        .then(({ generateInsights }) =>
          import("@/lib/data/insights").then(({ saveInsights }) => {
            return buildInsightContext(entry.id)
              .then((context) => generateInsights(context))
              .then((generatedInsights) => {
                const allInsights = [
                  ...generatedInsights.primary,
                  ...generatedInsights.secondary,
                  ...(generatedInsights.deep_dive || []),
                ].map((insight) => ({
                  ...insight,
                  tenant_id: user.tenant.id,
                  journal_entry_id: entry.id,
                }));
                return saveInsights(allInsights);
              });
          }),
        ),
    )
    .catch((err) => console.error("Failed to generate insights:", err));

  revalidatePath("/journals");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  return entry.id;
}


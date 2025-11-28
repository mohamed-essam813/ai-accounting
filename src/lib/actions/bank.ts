"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";

const ImportSchema = z.object({
  transactions: z.array(
    z.object({
      date: z.string(),
      description: z.string(),
      amount: z.number(),
      counterparty: z.string().optional().nullable(),
      sourceFile: z.string().optional(),
    }),
  ),
});

export async function importBankTransactionsAction(input: z.infer<typeof ImportSchema>) {
  const payload = ImportSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();

  const rows = payload.transactions.map((txn) => ({
    tenant_id: user.tenant.id,
    date: txn.date,
    amount: txn.amount,
    description: txn.description,
    counterparty: txn.counterparty ?? null,
    status: "unmatched",
    source_file: txn.sourceFile ?? null,
  }));

  const { error } = await supabase.from("bank_transactions").insert(rows);
  if (error) {
    throw error;
  }

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "bank.import",
    entity: "bank_transactions",
    changes: { imported: rows.length },
  });

  revalidatePath("/bank");
}

const MatchSchema = z.object({
  transactionId: z.string().uuid(),
  entryId: z.string().uuid(),
});

export async function matchBankTransactionAction(input: z.infer<typeof MatchSchema>) {
  const payload = MatchSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("bank_transactions")
    .update({ status: "matched", matched_entry_id: payload.entryId })
    .eq("id", payload.transactionId)
    .eq("tenant_id", user.tenant.id);

  if (error) {
    throw error;
  }

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "bank.matched",
    entity: "bank_transactions",
    entity_id: payload.transactionId,
    changes: { matched_entry_id: payload.entryId },
  });

  revalidatePath("/bank");
}


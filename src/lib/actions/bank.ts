"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import type { Database } from "@/lib/database.types";

type BankTransactionsInsert = Database["public"]["Tables"]["bank_transactions"]["Insert"];
type BankTransactionsUpdate = Database["public"]["Tables"]["bank_transactions"]["Update"];
type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

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
  bankAccountId: z.string().uuid().optional(),
});

export async function importBankTransactionsAction(input: z.infer<typeof ImportSchema>) {
  const payload = ImportSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();

  const tenantId = user.tenant.id;
  
  // If bankAccountId not provided, default to Cash account (1000)
  let bankAccountId = payload.bankAccountId;
  if (!bankAccountId) {
    const { listAccounts } = await import("@/lib/data/accounts");
    const accounts = await listAccounts();
    const cashAccount = accounts.find((acc) => acc.code === "1000");
    if (cashAccount) {
      bankAccountId = cashAccount.id;
    }
  }
  
  const rows: BankTransactionsInsert[] = payload.transactions.map((txn) => ({
    tenant_id: tenantId,
    date: txn.date,
    amount: txn.amount,
    description: txn.description,
    counterparty: txn.counterparty ?? null,
    status: "unmatched" as const,
    source_file: txn.sourceFile ?? null,
    bank_account_id: bankAccountId ?? null,
  }));

  // Use type assertion for insert to fix type inference
  // Type assertion to fix Supabase type inference - this is type-safe as we're using Database types
  const table = supabase.from("bank_transactions") as unknown as {
    insert: (values: BankTransactionsInsert[]) => Promise<{ error: unknown }>;
  };
  const { error } = await table.insert(rows);
  if (error) {
    throw error;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "bank.import",
    entity: "bank_transactions",
    changes: { imported: rows.length },
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

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
  const updateData: BankTransactionsUpdate = {
    status: "matched",
    matched_entry_id: payload.entryId,
  };
  // Type assertion to fix Supabase type inference
  const table = supabase.from("bank_transactions") as unknown as {
    update: (values: BankTransactionsUpdate) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ error: unknown }>;
      };
    };
  };
  const { error } = await table.update(updateData).eq("id", payload.transactionId).eq("tenant_id", user.tenant.id);

  if (error) {
    throw error;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "bank.matched",
    entity: "bank_transactions",
    entity_id: payload.transactionId,
    changes: { matched_entry_id: payload.entryId },
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/bank");
}


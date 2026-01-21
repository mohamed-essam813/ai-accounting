"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts, type UserRole } from "@/lib/auth";
import { PromptIntentEnum } from "@/lib/ai/schema";
import type { Database } from "@/lib/database.types";
import type { Account } from "@/lib/accounting";

type ChartOfAccountsInsert = Database["public"]["Tables"]["chart_of_accounts"]["Insert"];
type ChartOfAccountsRow = Database["public"]["Tables"]["chart_of_accounts"]["Row"];
type ChartOfAccountsUpdate = Database["public"]["Tables"]["chart_of_accounts"]["Update"];
type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];
type IntentMappingInsert = Database["public"]["Tables"]["intent_account_mappings"]["Insert"];
type IntentMappingRow = Database["public"]["Tables"]["intent_account_mappings"]["Row"];

// Server action to list accounts (for use in client components)
export async function listAccountsAction(): Promise<Account[]> {
  const { listAccounts } = await import("@/lib/data/accounts");
  return await listAccounts();
}

const AccountSchema = z.object({
  name: z.string().min(3),
  code: z.string().min(3).optional(), // Optional - will be generated if not provided
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  category: z.enum(["current", "non_current"]).nullable().optional(), // Only for assets/liabilities
});

export async function createAccountAction(input: z.infer<typeof AccountSchema>): Promise<ChartOfAccountsRow> {
  const payload = AccountSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("You do not have permission to manage the chart of accounts.");
  }

  // Determine category if not provided
  let category: "current" | "non_current" | null = payload.category ?? null;
  
  // If code is provided but category is not, determine from code
  if (payload.code && !category && (payload.type === "asset" || payload.type === "liability")) {
    const { determineCategoryFromCode } = await import("@/lib/accounting/determine-category");
    category = determineCategoryFromCode(payload.code, payload.type);
  }

  // Generate code if not provided
  let code = payload.code;
  if (!code) {
    const { generateAccountCode } = await import("@/lib/accounting/generate-account-code");
    code = await generateAccountCode(payload.type, user.tenant.id, category ?? undefined);
  }

  // Validate code and category match (warn but don't block)
  if (code && category && (payload.type === "asset" || payload.type === "liability")) {
    const { validateCodeCategoryMatch } = await import("@/lib/accounting/determine-category");
    const validation = validateCodeCategoryMatch(code, payload.type, category);
    if (!validation.valid && validation.expectedCategory) {
      console.warn(
        `Code ${code} and category ${category} don't match. Expected category: ${validation.expectedCategory}`,
      );
      // Auto-correct to match code range
      category = validation.expectedCategory;
    }
  }

  const supabase = await createServerSupabaseClient();
  // Use type assertion for category since it may not be in database types yet
  const insertData = {
    tenant_id: user.tenant.id,
    name: payload.name,
    code: code!, // Code is guaranteed to be defined at this point
    type: payload.type,
    ...(category && { category }),
  } as ChartOfAccountsInsert & { category?: "current" | "non_current" | null };
  // Use type assertion to fix Supabase type inference - type-safe using Database types
  const table = supabase.from("chart_of_accounts") as unknown as {
    insert: (values: ChartOfAccountsInsert[]) => {
      select: (columns?: string) => Promise<{ data: ChartOfAccountsRow[] | null; error: unknown }>;
    };
  };
  const { data: accounts, error } = await table.insert([insertData]).select("*");
  const account = accounts?.[0] ?? null;

  if (error) {
    throw error;
  }

  if (!account) {
    throw new Error("Failed to create account");
  }

  // Populate embedding for RAG (async, don't wait)
  const tenantId = user.tenant.id;
  import("@/lib/ai/populate-embeddings")
    .then(({ populateAccountEmbedding }) =>
      populateAccountEmbedding({
        tenantId,
        accountId: account.id,
        accountName: account.name,
        accountCode: account.code,
        accountType: account.type,
      }),
    )
    .catch((err) => console.error("Failed to populate account embedding:", err));

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "account.created",
    entity: "chart_of_accounts",
    changes: payload,
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/accounts");
  
  return account;
}

/**
 * Auto-create account with generated code (used by AI)
 * This function is called when AI suggests creating a new account
 */
export async function autoCreateAccountAction(
  name: string,
  type: "asset" | "liability" | "equity" | "revenue" | "expense",
  category?: "current" | "non_current" | null,
) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  // Generate account code automatically based on type and category
  const { generateAccountCode } = await import("@/lib/accounting/generate-account-code");
  const code = await generateAccountCode(type, user.tenant.id, category ?? undefined);

  // Create account
  const supabase = await createServerSupabaseClient();
  // Determine category if not provided (for assets/liabilities)
  let finalCategory: "current" | "non_current" | null = category ?? null;
  if (!finalCategory && (type === "asset" || type === "liability")) {
    const { determineCategoryFromCode } = await import("@/lib/accounting/determine-category");
    finalCategory = determineCategoryFromCode(code, type);
  }

  // Use type assertion for category since it may not be in database types yet
  const insertData = {
    tenant_id: user.tenant.id,
    name: name.trim(),
    code,
    type,
    ...(finalCategory && { category: finalCategory }),
  } as ChartOfAccountsInsert & { category?: "current" | "non_current" | null };

  const table = supabase.from("chart_of_accounts") as unknown as {
    insert: (values: ChartOfAccountsInsert[]) => {
      select: (columns?: string) => Promise<{ data: ChartOfAccountsRow[] | null; error: unknown }>;
    };
  };
  const { data: accounts, error } = await table.insert([insertData]).select("*");
  const account = accounts?.[0] ?? null;

  if (error) {
    console.error("Failed to auto-create account:", error);
    throw error;
  }

  if (!account) {
    throw new Error("Failed to create account");
  }

  // Populate embedding for RAG (async, don't wait)
  const tenantId = user.tenant.id;
  import("@/lib/ai/populate-embeddings")
    .then(({ populateAccountEmbedding }) =>
      populateAccountEmbedding({
        tenantId,
        accountId: account.id,
        accountName: account.name,
        accountCode: account.code,
        accountType: account.type,
      }),
    )
    .catch((err) => console.error("Failed to populate account embedding:", err));

  // Log to audit trail
  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "account.auto_created",
    entity: "chart_of_accounts",
    changes: { name, code, type, source: "ai_suggestion" },
  };
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/accounts");
  return account;
}

const ToggleSchema = z.object({
  accountId: z.string().uuid(),
  isActive: z.boolean(),
});

export async function toggleAccountStatusAction(input: z.infer<typeof ToggleSchema>) {
  const payload = ToggleSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("You do not have permission to manage the chart of accounts.");
  }

  const supabase = await createServerSupabaseClient();
  const updateData: ChartOfAccountsUpdate = {
    is_active: payload.isActive,
  };
  // Type assertion to fix Supabase type inference
  const table = supabase.from("chart_of_accounts") as unknown as {
    update: (values: ChartOfAccountsUpdate) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ error: unknown }>;
      };
    };
  };
  const { error } = await table.update(updateData).eq("id", payload.accountId).eq("tenant_id", user.tenant.id);

  if (error) {
    throw error;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "account.updated",
    entity: "chart_of_accounts",
    entity_id: payload.accountId,
    changes: { is_active: payload.isActive },
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/accounts");
}

const DeleteAccountSchema = z.object({
  accountId: z.string().uuid(),
});

export async function deleteAccountAction(input: z.infer<typeof DeleteAccountSchema>) {
  const payload = DeleteAccountSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("You do not have permission to manage the chart of accounts.");
  }

  const supabase = await createServerSupabaseClient();

  // Check if account exists and belongs to tenant
  const { data: account, error: fetchError } = await supabase
    .from("chart_of_accounts")
    .select<"id, code, name", Pick<ChartOfAccountsRow, "id" | "code" | "name">>("id, code, name")
    .eq("id", payload.accountId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (!account) {
    throw new Error("Account not found.");
  }

  // Check if account is used in journal lines
  const { count: journalLineCount } = await supabase
    .from("journal_lines")
    .select("id", { count: "exact", head: true })
    .eq("account_id", payload.accountId);

  if (journalLineCount && journalLineCount > 0) {
    throw new Error(
      `Cannot delete account "${account.name}" (${account.code}). ` +
      `It is used in ${journalLineCount} journal entry line(s). ` +
      `Deactivate the account instead if you want to prevent future use.`
    );
  }

  // Check if account is used in intent mappings
  const { data: mappings } = await supabase
    .from("intent_account_mappings")
    .select<"intent", Pick<IntentMappingRow, "intent">>("intent")
    .eq("tenant_id", user.tenant.id)
    .or(
      `debit_account_id.eq.${payload.accountId},credit_account_id.eq.${payload.accountId},tax_debit_account_id.eq.${payload.accountId},tax_credit_account_id.eq.${payload.accountId}`
    );

  if (mappings && mappings.length > 0) {
    const intents = mappings.map((m) => m.intent).join(", ");
    throw new Error(
      `Cannot delete account "${account.name}" (${account.code}). ` +
      `It is used in intent mappings: ${intents}. ` +
      `Please update or remove these mappings first.`
    );
  }

  // Delete account
  const { error: deleteError } = await supabase
    .from("chart_of_accounts")
    .delete()
    .eq("id", payload.accountId)
    .eq("tenant_id", user.tenant.id);

  if (deleteError) {
    throw deleteError;
  }

  // Clean up embeddings (async, don't wait)
  const tenantId = user.tenant.id;
  import("@/lib/supabase/service")
    .then(({ createServiceSupabaseClient }) => {
      const serviceSupabase = createServiceSupabaseClient();
      return serviceSupabase
        .from("embeddings")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("entity_type", "account")
        .eq("entity_id", payload.accountId);
    })
    .catch((err) => console.error("Failed to clean up account embeddings:", err));

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "account.deleted",
    entity: "chart_of_accounts",
    entity_id: payload.accountId,
    changes: {
      code: account.code,
      name: account.name,
    },
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/accounts");
}

const IntentMappingSchema = z.object({
  intent: PromptIntentEnum,
  debitAccountId: z.string().uuid(),
  creditAccountId: z.string().uuid(),
  taxDebitAccountId: z.string().uuid().nullable().optional(),
  taxCreditAccountId: z.string().uuid().nullable().optional(),
});

export async function updateIntentMappingAction(input: z.infer<typeof IntentMappingSchema>) {
  const payload = IntentMappingSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("You do not have permission to manage intent mappings.");
  }

  // FEEDBACK: Validate account types before saving
  const { listAccounts } = await import("@/lib/data/accounts");
  const { validateIntentMapping } = await import("@/lib/accounting/gl-mapping-validation");
  const allAccounts = await listAccounts();
  
  // Import type for validation
  type IntentAccountMapping = {
    intent: "create_invoice" | "create_bill" | "record_payment" | "reconcile_bank" | "generate_report" | "create_credit_note" | "create_debit_note";
    debit_account_id: string;
    credit_account_id: string;
    tax_debit_account_id: string | null;
    tax_credit_account_id: string | null;
  };
  
  const intentMapping: IntentAccountMapping = {
    intent: payload.intent,
    debit_account_id: payload.debitAccountId,
    credit_account_id: payload.creditAccountId,
    tax_debit_account_id: payload.taxDebitAccountId ?? null,
    tax_credit_account_id: payload.taxCreditAccountId ?? null,
  };
  
  const validation = validateIntentMapping(intentMapping, allAccounts, payload.intent);
  if (!validation.valid) {
    throw new Error(
      `Invalid account mapping: ${validation.errors.join("; ")}. ` +
      `Please select accounts with compatible types.`
    );
  }

  const supabase = await createServerSupabaseClient();
  const upsertData: IntentMappingInsert = {
    tenant_id: user.tenant.id,
    intent: payload.intent,
    debit_account_id: payload.debitAccountId,
    credit_account_id: payload.creditAccountId,
    tax_debit_account_id: payload.taxDebitAccountId ?? null,
    tax_credit_account_id: payload.taxCreditAccountId ?? null,
  };
  // Use type assertion for upsert to fix type inference
  // Type assertion to fix Supabase type inference - this is type-safe as we're using Database types
  const table = supabase.from("intent_account_mappings") as unknown as {
    upsert: (values: IntentMappingInsert[], options?: { onConflict?: string }) => Promise<{ error: unknown }>;
  };
  const { error } = await table.upsert([upsertData], { onConflict: "tenant_id,intent" });

  if (error) {
    throw error;
  }

  // Get account names for embedding
  const { data: accountData } = await supabase
    .from("chart_of_accounts")
    .select<"id, name", Pick<ChartOfAccountsRow, "id" | "name">>("id, name")
    .in("id", [
      payload.debitAccountId,
      payload.creditAccountId,
      payload.taxDebitAccountId,
      payload.taxCreditAccountId,
    ].filter(Boolean) as string[])
    .eq("tenant_id", user.tenant.id);

  const accountMap = new Map(accountData?.map((a: { id: string; name: string }) => [a.id, a.name]) ?? []);

  // Populate embedding for RAG (async, don't wait)
  const tenantId = user.tenant.id;
  import("@/lib/ai/populate-embeddings")
    .then(({ populateMappingEmbedding }) =>
      populateMappingEmbedding({
        tenantId,
        intent: payload.intent,
        debitAccountName: accountMap.get(payload.debitAccountId) ?? null,
        creditAccountName: accountMap.get(payload.creditAccountId) ?? null,
        taxAccountName: (payload.taxDebitAccountId
          ? accountMap.get(payload.taxDebitAccountId) ?? null
          : payload.taxCreditAccountId
            ? accountMap.get(payload.taxCreditAccountId) ?? null
            : null) as string | null,
      }),
    )
    .catch((err) => console.error("Failed to populate mapping embedding:", err));

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "intent_mapping.upserted",
    entity: "intent_account_mappings",
    changes: payload,
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/accounts");
}


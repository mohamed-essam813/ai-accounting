"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts } from "@/lib/auth";
import { PromptIntentEnum } from "@/lib/ai/schema";

const AccountSchema = z.object({
  name: z.string().min(3),
  code: z.string().min(3),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
});

export async function createAccountAction(input: z.infer<typeof AccountSchema>) {
  const payload = AccountSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role)) {
    throw new Error("You do not have permission to manage the chart of accounts.");
  }

  const supabase = await createServerSupabaseClient();
  const { data: account, error } = await supabase
    .from("chart_of_accounts")
    .insert({
      tenant_id: user.tenant.id,
      name: payload.name,
      code: payload.code,
      type: payload.type,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  // Populate embedding for RAG (async, don't wait)
  if (account) {
    import("@/lib/ai/populate-embeddings")
      .then(({ populateAccountEmbedding }) =>
        populateAccountEmbedding({
          tenantId: user.tenant.id,
          accountId: account.id,
          accountName: account.name,
          accountCode: account.code,
          accountType: account.type,
        }),
      )
      .catch((err) => console.error("Failed to populate account embedding:", err));
  }

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "account.created",
    entity: "chart_of_accounts",
    changes: payload,
  });

  revalidatePath("/accounts");
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

  if (!canManageAccounts(user.role)) {
    throw new Error("You do not have permission to manage the chart of accounts.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("chart_of_accounts")
    .update({ is_active: payload.isActive })
    .eq("id", payload.accountId)
    .eq("tenant_id", user.tenant.id);

  if (error) {
    throw error;
  }

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "account.updated",
    entity: "chart_of_accounts",
    entity_id: payload.accountId,
    changes: { is_active: payload.isActive },
  });

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

  if (!canManageAccounts(user.role)) {
    throw new Error("You do not have permission to manage the chart of accounts.");
  }

  const supabase = await createServerSupabaseClient();

  // Check if account exists and belongs to tenant
  const { data: account, error: fetchError } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name")
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
    .select("intent")
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
  import("@/lib/supabase/service")
    .then(({ createServiceSupabaseClient }) => {
      const serviceSupabase = createServiceSupabaseClient();
      return serviceSupabase
        .from("embeddings")
        .delete()
        .eq("tenant_id", user.tenant.id)
        .eq("entity_type", "account")
        .eq("entity_id", payload.accountId);
    })
    .catch((err) => console.error("Failed to clean up account embeddings:", err));

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "account.deleted",
    entity: "chart_of_accounts",
    entity_id: payload.accountId,
    changes: {
      code: account.code,
      name: account.name,
    },
  });

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

  if (!canManageAccounts(user.role)) {
    throw new Error("You do not have permission to manage intent mappings.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("intent_account_mappings")
    .upsert(
      {
        tenant_id: user.tenant.id,
        intent: payload.intent,
        debit_account_id: payload.debitAccountId,
        credit_account_id: payload.creditAccountId,
        tax_debit_account_id: payload.taxDebitAccountId ?? null,
        tax_credit_account_id: payload.taxCreditAccountId ?? null,
      },
      { onConflict: "tenant_id,intent" },
    );

  if (error) {
    throw error;
  }

  // Get account names for embedding
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, name")
    .in("id", [
      payload.debitAccountId,
      payload.creditAccountId,
      payload.taxDebitAccountId,
      payload.taxCreditAccountId,
    ].filter(Boolean) as string[])
    .eq("tenant_id", user.tenant.id);

  const accountMap = new Map(accounts?.map((a) => [a.id, a.name]) ?? []);

  // Populate embedding for RAG (async, don't wait)
  import("@/lib/ai/populate-embeddings")
    .then(({ populateMappingEmbedding }) =>
      populateMappingEmbedding({
        tenantId: user.tenant.id,
        intent: payload.intent,
        debitAccountName: accountMap.get(payload.debitAccountId) ?? null,
        creditAccountName: accountMap.get(payload.creditAccountId) ?? null,
        taxAccountName: payload.taxDebitAccountId
          ? accountMap.get(payload.taxDebitAccountId) ?? null
          : payload.taxCreditAccountId
            ? accountMap.get(payload.taxCreditAccountId) ?? null
            : null,
      }),
    )
    .catch((err) => console.error("Failed to populate mapping embedding:", err));

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "intent_mapping.upserted",
    entity: "intent_account_mappings",
    changes: payload,
  });

  revalidatePath("/accounts");
}


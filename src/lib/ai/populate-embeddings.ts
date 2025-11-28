import { storeEmbedding } from "./embeddings";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Populate embedding for an account when it's created or updated
 */
export async function populateAccountEmbedding(params: {
  tenantId: string;
  accountId: string;
  accountName: string;
  accountCode: string;
  accountType: string;
}) {
  // Create rich text content for embedding
  const content = `Account: ${params.accountName} (Code: ${params.accountCode}, Type: ${params.accountType})`;

  await storeEmbedding({
    tenantId: params.tenantId,
    entityType: "account",
    entityId: params.accountId,
    content,
    metadata: {
      account_code: params.accountCode,
      account_name: params.accountName,
      account_type: params.accountType,
    },
  });
}

/**
 * Populate embedding for a transaction/journal entry when it's posted
 */
export async function populateTransactionEmbedding(params: {
  tenantId: string;
  transactionId: string;
  description: string;
  counterparty: string | null;
  amount: number;
  currency: string;
  date: string;
  intent: string;
}) {
  // Create rich text content for embedding
  const parts = [
    `Transaction: ${params.description}`,
    params.counterparty ? `Counterparty: ${params.counterparty}` : null,
    `Amount: ${params.amount} ${params.currency}`,
    `Date: ${params.date}`,
    `Intent: ${params.intent}`,
  ].filter(Boolean);

  const content = parts.join(", ");

  await storeEmbedding({
    tenantId: params.tenantId,
    entityType: "transaction",
    entityId: params.transactionId,
    content,
    metadata: {
      transaction_date: params.date,
      amount: params.amount,
      currency: params.currency,
      intent: params.intent,
      counterparty: params.counterparty,
    },
  });
}

/**
 * Populate embedding for intent-to-account mapping
 */
export async function populateMappingEmbedding(params: {
  tenantId: string;
  intent: string;
  debitAccountName: string | null;
  creditAccountName: string | null;
  taxAccountName: string | null;
}) {
  const parts = [
    `Intent mapping for: ${params.intent}`,
    params.debitAccountName ? `Debit account: ${params.debitAccountName}` : null,
    params.creditAccountName ? `Credit account: ${params.creditAccountName}` : null,
    params.taxAccountName ? `Tax account: ${params.taxAccountName}` : null,
  ].filter(Boolean);

  const content = parts.join(", ");

  await storeEmbedding({
    tenantId: params.tenantId,
    entityType: "mapping",
    entityId: null, // Mappings don't have a single entity ID
    content,
    metadata: {
      intent: params.intent,
    },
  });
}

/**
 * Batch populate embeddings for all existing accounts (useful for initial setup)
 */
export async function populateAllAccountEmbeddings(tenantId: string) {
  const supabase = createServiceSupabaseClient();
  const { data: accounts, error } = await supabase
    .from("chart_of_accounts")
    .select("id, name, code, type")
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Failed to load accounts for embedding", error);
    return;
  }

  if (!accounts || accounts.length === 0) {
    return;
  }

  // Populate embeddings for all accounts
  await Promise.all(
    accounts.map((account) =>
      populateAccountEmbedding({
        tenantId,
        accountId: account.id,
        accountName: account.name,
        accountCode: account.code,
        accountType: account.type,
      }),
    ),
  );

  console.log(`Populated embeddings for ${accounts.length} accounts`);
}

/**
 * Batch populate embeddings for all intent mappings
 */
export async function populateAllMappingEmbeddings(tenantId: string) {
  const supabase = createServiceSupabaseClient();
  const { data: mappings, error } = await supabase
    .from("intent_account_mappings")
    .select("intent, debit_account_id, credit_account_id, tax_debit_account_id, tax_credit_account_id")
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Failed to load mappings for embedding", error);
    return;
  }

  if (!mappings || mappings.length === 0) {
    return;
  }

  // Get account names for the mappings
  const accountIds = new Set<string>();
  mappings.forEach((m) => {
    if (m.debit_account_id) accountIds.add(m.debit_account_id);
    if (m.credit_account_id) accountIds.add(m.credit_account_id);
    if (m.tax_debit_account_id) accountIds.add(m.tax_debit_account_id);
    if (m.tax_credit_account_id) accountIds.add(m.tax_credit_account_id);
  });

  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, name")
    .in("id", Array.from(accountIds));

  const accountMap = new Map(accounts?.map((a) => [a.id, a.name]) ?? []);

  // Populate embeddings for all mappings
  await Promise.all(
    mappings.map((mapping) =>
      populateMappingEmbedding({
        tenantId,
        intent: mapping.intent,
        debitAccountName: mapping.debit_account_id ? accountMap.get(mapping.debit_account_id) ?? null : null,
        creditAccountName: mapping.credit_account_id ? accountMap.get(mapping.credit_account_id) ?? null : null,
        taxAccountName: mapping.tax_debit_account_id
          ? accountMap.get(mapping.tax_debit_account_id) ?? null
          : mapping.tax_credit_account_id
            ? accountMap.get(mapping.tax_credit_account_id) ?? null
            : null,
      }),
    ),
  );

  console.log(`Populated embeddings for ${mappings.length} intent mappings`);
}


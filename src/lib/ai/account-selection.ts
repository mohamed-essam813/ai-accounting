import { retrieveRelevantContext } from "./embeddings";
import type { Account } from "../accounting";

/**
 * Dynamically select accounts from chart of accounts based on prompt using RAG
 * This replaces manual mapping by finding the most relevant accounts via vector similarity
 */
export async function selectAccountsFromPrompt(
  prompt: string,
  intent: string,
  tenantId: string,
  allAccounts: Account[],
): Promise<{
  debitAccountId: string | null;
  creditAccountId: string | null;
  taxDebitAccountId: string | null;
  taxCreditAccountId: string | null;
}> {
  // Build a query that includes intent and prompt for better account matching
  const query = `${intent} ${prompt}`;

  // Retrieve relevant accounts using RAG
  const relevantAccounts = await retrieveRelevantContext(query, tenantId, {
    limit: 10,
    entityTypes: ["account", "mapping"],
    similarityThreshold: 0.6, // Lower threshold to get more candidates
  });

  // Extract account IDs from RAG results
  const accountIdsFromRAG = new Set<string>();
  relevantAccounts.forEach((ctx) => {
    if (ctx.metadata?.account_id) {
      accountIdsFromRAG.add(ctx.metadata.account_id as string);
    }
    // Also check if entity_id is an account
    if (ctx.metadata?.entity_type === "account" && ctx.metadata?.entity_id) {
      accountIdsFromRAG.add(ctx.metadata.entity_id as string);
    }
  });

  // Find accounts by ID
  const matchedAccounts = allAccounts.filter((acc) => accountIdsFromRAG.has(acc.id));

  // Select accounts based on intent and account types
  let debitAccountId: string | null = null;
  let creditAccountId: string | null = null;
  let taxDebitAccountId: string | null = null;
  let taxCreditAccountId: string | null = null;

  // Helper to find account by type and code pattern
  const findAccountByType = (type: string, codePrefix?: string) => {
    return allAccounts.find(
      (acc) => acc.type === type && (!codePrefix || acc.code.startsWith(codePrefix)),
    );
  };

  // Helper to find best matching account from RAG results
  const findBestMatch = (type: string, codePrefix?: string) => {
    // First try to find from RAG-matched accounts
    const ragMatch = matchedAccounts.find(
      (acc) => acc.type === type && (!codePrefix || acc.code.startsWith(codePrefix)),
    );
    if (ragMatch) return ragMatch;

    // Fallback to any account of that type
    return findAccountByType(type, codePrefix);
  };

  switch (intent) {
    case "create_invoice":
      // Invoice: DR Accounts Receivable, CR Revenue
      debitAccountId = findBestMatch("asset", "11")?.id ?? findAccountByType("asset", "11")?.id ?? null;
      creditAccountId = findBestMatch("revenue")?.id ?? findAccountByType("revenue")?.id ?? null;
      taxDebitAccountId = null;
      taxCreditAccountId = findBestMatch("liability", "21")?.id ?? findAccountByType("liability", "21")?.id ?? null;
      break;

    case "create_bill":
      // Bill: DR Expense, CR Accounts Payable
      debitAccountId = findBestMatch("expense")?.id ?? findAccountByType("expense")?.id ?? null;
      creditAccountId = findBestMatch("liability", "20")?.id ?? findAccountByType("liability", "20")?.id ?? null;
      taxDebitAccountId = findBestMatch("asset", "51")?.id ?? findAccountByType("asset", "51")?.id ?? null;
      taxCreditAccountId = null;
      break;

    case "record_payment":
      // Payment: DR/CR depends on direction, but typically involves Cash/Bank
      const cashAccount = findBestMatch("asset", "10") ?? findAccountByType("asset", "10");
      if (cashAccount) {
        // For customer payment: DR Cash, CR Accounts Receivable
        // For vendor payment: DR Accounts Payable, CR Cash
        // We'll default to customer payment pattern
        debitAccountId = cashAccount.id;
        creditAccountId = findBestMatch("asset", "11")?.id ?? findAccountByType("asset", "11")?.id ?? null;
      }
      break;

    case "create_credit_note":
      // Credit Note: DR Revenue, DR VAT Output, CR Accounts Receivable
      debitAccountId = findBestMatch("revenue")?.id ?? findAccountByType("revenue")?.id ?? null;
      creditAccountId = findBestMatch("asset", "11")?.id ?? findAccountByType("asset", "11")?.id ?? null;
      taxDebitAccountId = findBestMatch("liability", "21")?.id ?? findAccountByType("liability", "21")?.id ?? null;
      taxCreditAccountId = null;
      break;

    case "create_debit_note":
      // Debit Note: DR Accounts Payable, CR Expense, CR VAT Input
      debitAccountId = findBestMatch("liability", "20")?.id ?? findAccountByType("liability", "20")?.id ?? null;
      creditAccountId = findBestMatch("expense")?.id ?? findAccountByType("expense")?.id ?? null;
      taxDebitAccountId = null;
      taxCreditAccountId = findBestMatch("asset", "51")?.id ?? findAccountByType("asset", "51")?.id ?? null;
      break;

    default:
      // For other intents, return null (will fall back to manual mapping)
      break;
  }

  return {
    debitAccountId,
    creditAccountId,
    taxDebitAccountId,
    taxCreditAccountId,
  };
}

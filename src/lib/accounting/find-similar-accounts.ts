/**
 * Find similar accounts using embeddings and account type matching
 * Used to prevent duplicate account creation
 */

import { retrieveRelevantContext } from "@/lib/ai/embeddings";
import { listAccounts } from "@/lib/data/accounts";
import type { Account } from "../accounting";

export type SimilarAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  similarity: number;
};

/**
 * Find similar accounts to a suggested account name
 * Uses embeddings to find accounts with similar names and same type
 */
export async function findSimilarAccounts(
  suggestedName: string,
  accountType: "asset" | "liability" | "equity" | "revenue" | "expense",
  tenantId: string,
  similarityThreshold: number = 0.75,
): Promise<SimilarAccount[]> {
  // Get all accounts for the tenant
  const allAccounts = await listAccounts();
  if (allAccounts.length === 0) {
    return [];
  }

  // Filter accounts by type first (only compare with same type)
  const accountsOfType = allAccounts.filter((acc) => acc.type === accountType);
  if (accountsOfType.length === 0) {
    return [];
  }

  // Use embeddings to find similar account names
  const query = `${suggestedName} ${accountType} account`;
  const similarContexts = await retrieveRelevantContext(query, tenantId, {
    limit: 10,
    entityTypes: ["account"],
    similarityThreshold,
  });

  // Extract account IDs from similar contexts
  const similarAccountIds = new Set<string>();
  similarContexts.forEach((ctx) => {
    if (ctx.metadata?.entity_type === "account" && ctx.metadata?.entity_id) {
      similarAccountIds.add(ctx.metadata.entity_id as string);
    }
    if (ctx.metadata?.account_id) {
      similarAccountIds.add(ctx.metadata.account_id as string);
    }
  });

  // Find matching accounts and include similarity scores
  const similarAccounts: SimilarAccount[] = [];
  const contextMap = new Map(
    similarContexts.map((ctx) => [
      (ctx.metadata?.entity_id || ctx.metadata?.account_id) as string,
      ctx.similarity,
    ]),
  );

  accountsOfType.forEach((account) => {
    if (similarAccountIds.has(account.id)) {
      const similarity = contextMap.get(account.id) ?? 0;
      similarAccounts.push({
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        similarity: Math.round(similarity * 100) / 100, // Round to 2 decimal places
      });
    }
  });

  // Sort by similarity (highest first)
  similarAccounts.sort((a, b) => b.similarity - a.similarity);

  // Also do a simple text similarity check for accounts not found by embeddings
  // This catches cases where embeddings might miss obvious matches
  const suggestedLower = suggestedName.toLowerCase().trim();
  accountsOfType.forEach((account) => {
    if (!similarAccountIds.has(account.id)) {
      const accountLower = account.name.toLowerCase().trim();
      
      // Check for exact substring match
      if (accountLower.includes(suggestedLower) || suggestedLower.includes(accountLower)) {
        // Calculate simple similarity based on common words
        const suggestedWords = new Set(suggestedLower.split(/\s+/));
        const accountWords = new Set(accountLower.split(/\s+/));
        const commonWords = [...suggestedWords].filter((word) => accountWords.has(word));
        const similarity = commonWords.length / Math.max(suggestedWords.size, accountWords.size);
        
        if (similarity >= similarityThreshold) {
          similarAccounts.push({
            id: account.id,
            code: account.code,
            name: account.name,
            type: account.type,
            similarity: Math.round(similarity * 100) / 100,
          });
        }
      }
    }
  });

  // Remove duplicates and sort again
  const uniqueAccounts = Array.from(
    new Map(similarAccounts.map((acc) => [acc.id, acc])).values(),
  );
  uniqueAccounts.sort((a, b) => b.similarity - a.similarity);

  return uniqueAccounts.slice(0, 5); // Return top 5 most similar
}


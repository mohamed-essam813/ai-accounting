/**
 * Stateful Prompt Resolution Pipeline
 * Handles account creation and intent resumption without blocking user
 * 
 * Fixes bug: When AI asks to create revenue account, execution stops after confirmation
 * Solution: Auto-create accounts silently, then re-parse prompt with updated account list
 */

import { parseAccountingPrompt } from "./index";
import { autoCreateMissingAccounts } from "./account-creation";
import { DraftSchema } from "./schema";
import { z } from "zod";

type PromptContext = {
  tenantId: string;
  userId: string;
};

/**
 * Resolve prompt with automatic account creation
 * 
 * Flow:
 * 1. Parse prompt (may request account creation)
 * 2. Auto-create missing accounts silently
 * 3. Re-parse with updated account list
 * 4. Return result (never block on account creation)
 */
export async function resolvePromptWithAccountCreation(
  prompt: string,
  context: PromptContext,
): Promise<z.infer<typeof DraftSchema>> {
  // Step 1: Parse prompt (may indicate missing accounts)
  let result = await parseAccountingPrompt(prompt, context);

  // Step 2: Check if account creation is needed
  // The AI response indicates missing accounts when existing_account_id is null
  if (result.accounts) {
    // Step 3: Auto-create missing accounts silently
    const createdAccounts = await autoCreateMissingAccounts(
      result.accounts,
      context.tenantId,
    );

    // Step 4: If accounts were created, re-parse with updated account list
    // This ensures the new accounts are available for selection
    if (createdAccounts.length > 0) {
      // Re-parse with the same prompt (accounts now exist)
      // The AI will now find the newly created accounts
      result = await parseAccountingPrompt(prompt, context);
    }
  }

  // Step 5: Return result (never block on account creation)
  return result;
}

/**
 * Auto-generate account codes based on account type
 * Ensures no duplicate codes by finding the next available code in the range
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
type AccountCategory = "current" | "non_current" | null;

/**
 * Get the code range for an account type and category
 */
function getCodeRange(
  accountType: AccountType,
  category?: AccountCategory,
): { min: number; max: number } {
  if (accountType === "asset") {
    if (category === "current") {
      return { min: 1000, max: 1499 };
    }
    if (category === "non_current") {
      return { min: 1500, max: 1999 };
    }
    // No category specified - default to current range first
    return { min: 1000, max: 1999 };
  }

  if (accountType === "liability") {
    if (category === "current") {
      return { min: 2000, max: 2499 };
    }
    if (category === "non_current") {
      return { min: 2500, max: 2999 };
    }
    // No category specified - default to current range first
    return { min: 2000, max: 2999 };
  }

  // Equity, Revenue, Expense don't have categories
  switch (accountType) {
    case "equity":
      return { min: 3000, max: 3999 };
    case "revenue":
      return { min: 4000, max: 4999 };
    case "expense":
      return { min: 5000, max: 5999 };
    default:
      throw new Error(`Unknown account type: ${accountType}`);
  }
}

/**
 * Generate the next available account code for a given type and optional category
 * Algorithm:
 * 1. Determine code range based on type and category
 * 2. Find highest existing code in range
 * 3. Increment by 100 first (e.g., 1000 → 1100 → 1200)
 * 4. If range exhausted, increment by 10 (e.g., 1990 → 1991)
 * 5. If still exhausted, increment by 1 (shouldn't happen)
 * 
 * For assets/liabilities without category:
 * - Tries current range first, then non-current range
 */
export async function generateAccountCode(
  accountType: AccountType,
  tenantId: string,
  category?: AccountCategory,
): Promise<string> {
  // For assets/liabilities without category, try current range first
  if ((accountType === "asset" || accountType === "liability") && !category) {
    try {
      return await generateAccountCode(accountType, tenantId, "current");
    } catch (error) {
      // Current range exhausted, try non-current
      return await generateAccountCode(accountType, tenantId, "non_current");
    }
  }

  const { min, max } = getCodeRange(accountType, category);
  const supabase = await createServerSupabaseClient();

  // Get all existing codes in this range for this tenant
  type ChartOfAccountsRow = Database["public"]["Tables"]["chart_of_accounts"]["Row"];
  const table = supabase.from("chart_of_accounts") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{
        data: Pick<ChartOfAccountsRow, "code">[] | null;
        error: unknown;
      }>;
    };
  };

  // Query all accounts for this tenant (we'll filter by code range in memory)
  const { data: existingAccounts, error } = await table
    .select("code")
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Failed to fetch existing accounts for code generation:", error);
    throw new Error("Failed to generate account code");
  }

  // Extract existing codes as numbers, filtering by range
  const existingCodes = new Set(
    (existingAccounts ?? [])
      .map((acc: Pick<ChartOfAccountsRow, "code">) => parseInt(acc.code, 10))
      .filter((code: number) => !isNaN(code) && code >= min && code <= max),
  );

  // Find next available code
  // Strategy 1: Try increments of 100 (e.g., 1000, 1100, 1200, ...)
  for (let code = min; code <= max; code += 100) {
    if (!existingCodes.has(code)) {
      return code.toString().padStart(4, "0");
    }
  }

  // Strategy 2: Try increments of 10 (e.g., 1990, 1991, 1992, ...)
  // Start from the highest multiple of 100 in range
  const highestHundred = Math.floor(max / 100) * 100;
  for (let code = highestHundred; code <= max; code += 10) {
    if (!existingCodes.has(code)) {
      return code.toString().padStart(4, "0");
    }
  }

  // Strategy 3: Try increments of 1 (shouldn't happen, but handle it)
  for (let code = min; code <= max; code += 1) {
    if (!existingCodes.has(code)) {
      return code.toString().padStart(4, "0");
    }
  }

  // If we've exhausted the range, throw an error
  throw new Error(
    `Account code range exhausted for type "${accountType}" (${min}-${max}). Please contact support.`,
  );
}


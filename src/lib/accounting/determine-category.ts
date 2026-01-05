/**
 * Determine account category (current/non-current) from code and type
 * Used for auto-categorization when code is provided
 */

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

/**
 * Determine category from account code and type
 * Assets: 1000-1499 = current, 1500-1999 = non_current
 * Liabilities: 2000-2499 = current, 2500-2999 = non_current
 * Others: null
 */
export function determineCategoryFromCode(
  code: string,
  type: AccountType,
): "current" | "non_current" | null {
  const codeNum = parseInt(code, 10);
  if (isNaN(codeNum)) {
    return null;
  }

  if (type === "asset") {
    if (codeNum >= 1000 && codeNum < 1500) {
      return "current";
    }
    if (codeNum >= 1500 && codeNum < 2000) {
      return "non_current";
    }
  }

  if (type === "liability") {
    if (codeNum >= 2000 && codeNum < 2500) {
      return "current";
    }
    if (codeNum >= 2500 && codeNum < 3000) {
      return "non_current";
    }
  }

  // Equity, Revenue, Expense don't have categories
  return null;
}

/**
 * Validate that code and category are consistent
 * Returns true if they match, false if they conflict
 */
export function validateCodeCategoryMatch(
  code: string,
  type: AccountType,
  category: "current" | "non_current" | null,
): { valid: boolean; expectedCategory?: "current" | "non_current" | null } {
  if (category === null) {
    // No category required for equity, revenue, expense
    if (type === "equity" || type === "revenue" || type === "expense") {
      return { valid: true };
    }
    // Assets and liabilities should have category
    return { valid: false, expectedCategory: determineCategoryFromCode(code, type) };
  }

  const expectedCategory = determineCategoryFromCode(code, type);
  if (expectedCategory === null) {
    // Code is outside expected ranges, but category is set
    return { valid: false, expectedCategory: null };
  }

  return {
    valid: expectedCategory === category,
    expectedCategory,
  };
}


/**
 * Identify AR/AP chart rows for subledger (statement of account, contact linkage on lines).
 * Prefer prd_account_kind; fall back to default codes when prd is unset (legacy tenants).
 */

export function accountIsArOrAp(a: { prd_account_kind?: string | null; code?: string }): boolean {
  const prd = a.prd_account_kind;
  if (prd === "accounts_receivable" || prd === "accounts_payable") return true;
  const c = a.code ?? "";
  return c === "1100" || c === "2000";
}

/** Whether this AR/AP account is the one used for the contact type's open-item subledger. */
export function accountMatchesContactStatementType(
  contactType: "customer" | "vendor" | "other",
  a: { prd_account_kind?: string | null; code?: string },
): boolean {
  if (!accountIsArOrAp(a)) return false;
  if (contactType === "other") return true;
  if (contactType === "customer") {
    return a.prd_account_kind === "accounts_receivable" || a.code === "1100";
  }
  return a.prd_account_kind === "accounts_payable" || a.code === "2000";
}

/** Set journal_lines.contact_id only on AR/AP lines (posting / edits). */
export function subledgerContactIdForLine(
  account: { prd_account_kind?: string | null; code?: string },
  draftContactId: string | null | undefined,
): string | null {
  if (!draftContactId) return null;
  if (!accountIsArOrAp(account)) return null;
  return draftContactId;
}

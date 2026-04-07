import type { Account, JournalLine } from "@/lib/accounting";
import { PostDraftValidationError } from "@/lib/posting/post-draft-errors";

export type DraftPostingValidationContext = {
  intent: string;
  lines: JournalLine[];
  accounts: Account[];
  /** ISO date string from draft — rejects future dates */
  postingDate?: string | null;
};

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * Pre-post checks: balance, account existence/active, intent-specific GL rules.
 * Call after journal lines are fully built (including inventory adjustments).
 */
export function validateDraftPostingJournalLines(ctx: DraftPostingValidationContext): void {
  const { intent, lines, accounts, postingDate } = ctx;
  if (postingDate) {
    const d = new Date(postingDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (d > today) {
      throw new PostDraftValidationError(
        "VALIDATION_FAILED",
        "Transaction date cannot be in the future.",
        { postingDate },
      );
    }
  }

  if (lines.length === 0) {
    throw new PostDraftValidationError("MISSING_REQUIRED_FIELD", "No journal lines generated for this draft.");
  }

  const debitTotal = round2(lines.reduce((s, l) => s + Number(l.debit), 0));
  const creditTotal = round2(lines.reduce((s, l) => s + Number(l.credit), 0));

  if (debitTotal !== creditTotal) {
    const diff = round2(debitTotal - creditTotal);
    throw new PostDraftValidationError(
      "JOURNAL_NOT_BALANCED",
      `Journal is not balanced: total debits ${debitTotal} vs credits ${creditTotal} (difference ${Math.abs(diff)}).`,
      {
        debit_total: debitTotal,
        credit_total: creditTotal,
        difference: Math.abs(diff),
      },
    );
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const ids = [...new Set(lines.map((l) => l.account_id))];
  for (const aid of ids) {
    const acc = accountById.get(aid);
    if (!acc) {
      throw new PostDraftValidationError(
        "INVALID_ACCOUNT_MAPPING",
        `Account is missing from the chart of accounts (id ${aid}). Refresh accounts or fix the draft.`,
        { account_id: aid },
      );
    }
    if (acc.is_active === false) {
      throw new PostDraftValidationError(
        "INVALID_ACCOUNT_MAPPING",
        `Account ${acc.code} — ${acc.name} is inactive and cannot be posted.`,
        { account_id: aid, code: acc.code, name: acc.name },
      );
    }
  }

  if (intent === "create_invoice") {
    for (const line of lines) {
      const acc = accountById.get(line.account_id);
      if (!acc) continue;
      if (acc.type === "expense") {
        throw new PostDraftValidationError(
          "INVALID_ACCOUNT_MAPPING",
          `Sales invoices cannot post to expense account "${acc.name}" (${acc.code}). Use a revenue account or fix the line.`,
          { account_id: acc.id, code: acc.code, name: acc.name },
        );
      }
      const cls = (acc as { account_classification?: string | null }).account_classification;
      if (acc.type === "revenue" && cls === "other_income") {
        throw new PostDraftValidationError(
          "INVALID_ACCOUNT_MAPPING",
          `This sales invoice uses "${acc.name}" (${acc.code}), which is classified as Other income. Use a standard revenue account for product/service sales, or adjust the item’s revenue account in Inventory.`,
          { account_id: acc.id, code: acc.code, name: acc.name },
        );
      }
    }
  }

  if (intent === "create_bill") {
    for (const line of lines) {
      const acc = accountById.get(line.account_id);
      if (!acc) continue;
      if (acc.type === "revenue") {
        throw new PostDraftValidationError(
          "INVALID_ACCOUNT_MAPPING",
          `Supplier bills cannot post to revenue account "${acc.name}" (${acc.code}). Use expense, inventory, asset, or VAT accounts as appropriate.`,
          { account_id: acc.id, code: acc.code, name: acc.name },
        );
      }
    }
  }
}

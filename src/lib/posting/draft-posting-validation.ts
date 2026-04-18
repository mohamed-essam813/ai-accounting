import type { Account, JournalLine } from "@/lib/accounting";
import { PostDraftValidationError } from "@/lib/posting/post-draft-errors";

const EDIT_HINT = " Open Edit Draft → Edit Details to fix the line.";

export type DraftPostingValidationContext = {
  intent: string;
  lines: JournalLine[];
  accounts: Account[];
  /** ISO date string from draft — rejects future dates */
  postingDate?: string | null;
  /**
   * Inventory asset account IDs for items on this sales invoice (perpetual inventory).
   * When set, COGS debits must pair with credits to these accounts at equal amounts.
   */
  saleInventoryAccountIds?: string[];
  /** Output VAT GL accounts from tax_rates — used for AR vs revenue reconciliation */
  outputVatAccountIds?: Set<string>;
};

function round2(n: number): number {
  return Number(n.toFixed(2));
}

type AccountRow = Account & {
  is_cogs?: boolean;
  detail_type?: string | null;
  prd_account_kind?: string | null;
};

function isCogsAccount(acc: AccountRow): boolean {
  if (acc.is_cogs === true) return true;
  if (acc.type !== "expense") return false;
  return (acc.code ?? "").trim() === "5500";
}

function isInventoryReliefAccount(acc: AccountRow, saleInventoryAccountIds?: string[]): boolean {
  if (saleInventoryAccountIds?.length && saleInventoryAccountIds.includes(acc.id)) return true;
  if (acc.type !== "asset") return false;
  if (acc.detail_type === "inventory") return true;
  const dt = acc.detail_type ?? "";
  if (dt === "other_current_asset") {
    return /\binventory\b/i.test(acc.name ?? "") || (acc.code ?? "").trim().startsWith("120");
  }
  const codeNum = parseInt(acc.code ?? "", 10);
  return codeNum >= 1200 && codeNum < 1300;
}

function isReceivableOrCashSaleDebit(acc: AccountRow): boolean {
  const prd = acc.prd_account_kind ?? null;
  if (prd === "accounts_receivable") return true;
  if ((acc.code ?? "").trim() === "1100") return true;
  if (prd === "bank" || prd === "cash") return true;
  if (acc.detail_type === "bank") return true;
  return false;
}

/**
 * Pre-post checks: balance, account existence/active, intent-specific GL rules.
 * Call after journal lines are fully built (including inventory / COGS from the costing engine).
 */
export function validateDraftPostingJournalLines(ctx: DraftPostingValidationContext): void {
  const { intent, lines, accounts, postingDate, saleInventoryAccountIds, outputVatAccountIds } = ctx;
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

  const accountById = new Map(accounts.map((a) => [a.id, a as AccountRow]));
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
        if (!isCogsAccount(acc)) {
          throw new PostDraftValidationError(
            "INVALID_ACCOUNT_MAPPING",
            `Sales invoices cannot debit expense account "${acc.name}" (${acc.code}) unless it is flagged as COGS.${EDIT_HINT}`,
            { account_id: acc.id, code: acc.code, name: acc.name },
          );
        }
      }

      const cls = acc.account_classification ?? null;
      if (acc.type === "revenue" && cls === "other_income") {
        throw new PostDraftValidationError(
          "INVALID_ACCOUNT_MAPPING",
          `This sales invoice uses "${acc.name}" (${acc.code}), which is classified as Other income. Use a standard revenue account for product/service sales, or adjust the item’s revenue account in Inventory.`,
          { account_id: acc.id, code: acc.code, name: acc.name },
        );
      }

    }

    let cogsDebitTotal = 0;
    let inventoryReliefCreditTotal = 0;
    for (const line of lines) {
      const acc = accountById.get(line.account_id);
      if (!acc) continue;
      if (line.debit > 0 && line.credit === 0 && isCogsAccount(acc)) {
        cogsDebitTotal = round2(cogsDebitTotal + Number(line.debit));
      }
      if (line.credit > 0 && line.debit === 0 && isInventoryReliefAccount(acc, saleInventoryAccountIds)) {
        inventoryReliefCreditTotal = round2(inventoryReliefCreditTotal + Number(line.credit));
      }
    }

    const hasInvSaleContext = (saleInventoryAccountIds?.length ?? 0) > 0;
    if (hasInvSaleContext) {
      if (cogsDebitTotal > 0 && inventoryReliefCreditTotal === 0) {
        throw new PostDraftValidationError(
          "INVALID_ACCOUNT_MAPPING",
          `Inventory sale requires both a COGS debit and an Inventory credit. Missing: inventory relief line.${EDIT_HINT}`,
          { cogsDebitTotal, inventoryReliefCreditTotal },
        );
      }
      if (inventoryReliefCreditTotal > 0 && cogsDebitTotal === 0) {
        throw new PostDraftValidationError(
          "INVALID_ACCOUNT_MAPPING",
          `Inventory sale requires both a COGS debit and an Inventory credit. Missing: COGS line.${EDIT_HINT}`,
          { cogsDebitTotal, inventoryReliefCreditTotal },
        );
      }
      if (cogsDebitTotal > 0 && inventoryReliefCreditTotal > 0 && Math.abs(cogsDebitTotal - inventoryReliefCreditTotal) > 0.02) {
        throw new PostDraftValidationError(
          "INVALID_ACCOUNT_MAPPING",
          `COGS amount (AED ${cogsDebitTotal}) must equal Inventory credit (AED ${inventoryReliefCreditTotal}).${EDIT_HINT}`,
          { cogsDebitTotal, inventoryReliefCreditTotal },
        );
      }
    }

    let arOrCashDebit = 0;
    let revenueCredit = 0;
    let outputVatCredit = 0;
    const vatIds = outputVatAccountIds ?? new Set<string>();

    for (const line of lines) {
      const acc = accountById.get(line.account_id);
      if (!acc) continue;
      if (line.debit > 0 && line.credit === 0 && isReceivableOrCashSaleDebit(acc)) {
        arOrCashDebit = round2(arOrCashDebit + Number(line.debit));
      }
      if (line.credit > 0 && line.debit === 0 && acc.type === "revenue") {
        revenueCredit = round2(revenueCredit + Number(line.credit));
      }
      if (line.credit > 0 && line.debit === 0 && vatIds.has(line.account_id)) {
        outputVatCredit = round2(outputVatCredit + Number(line.credit));
      }
    }

    if (arOrCashDebit > 0 && revenueCredit > 0) {
      const expectedRev = round2(arOrCashDebit - outputVatCredit);
      if (Math.abs(expectedRev - revenueCredit) > 0.02) {
        throw new PostDraftValidationError(
          "INVALID_ACCOUNT_MAPPING",
          `Revenue line must tie to receivable/cash minus output VAT: expected revenue AED ${expectedRev} (AR/cash ${arOrCashDebit} − VAT ${outputVatCredit}), got AED ${revenueCredit}.`,
          { arOrCashDebit, outputVatCredit, revenueCredit, expectedRev },
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

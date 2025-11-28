import { DraftPayload } from "@/lib/ai/schema";
import { Database } from "@/lib/database.types";
import { format } from "date-fns";

type Account = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

export type JournalLine = {
  account_id: string;
  debit: number;
  credit: number;
  memo?: string | null;
};

export type IntentAccountMapping = {
  intent: DraftPayload["intent"];
  debit_account_id: string;
  credit_account_id: string;
  tax_debit_account_id: string | null;
  tax_credit_account_id: string | null;
};

export function ensureBalanced(lines: JournalLine[]) {
  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
  const roundedDebit = Number(totalDebit.toFixed(2));
  const roundedCredit = Number(totalCredit.toFixed(2));
  if (roundedDebit !== roundedCredit) {
    throw new Error(
      `Journal entry is not balanced. Debit ${roundedDebit} vs Credit ${roundedCredit}`,
    );
  }
}

export function buildDefaultJournalLines(
  draft: DraftPayload,
  accounts: Account[],
  mapping?: IntentAccountMapping | null,
): { description: string; lines: JournalLine[] } {
  const { intent, entities } = draft;
  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  const findAccountById = (id: string) => {
    const account = accountMap.get(id);
    if (!account) {
      throw new Error(`Configured account (${id}) missing from chart of accounts`);
    }
    return account;
  };

  const resolveByCode = (code: string) => accounts.find((acct) => acct.code === code);

  const fallbackMapping = inferMappingFromCodes(intent, accounts, resolveByCode);
  const resolvedMapping = mapping ?? fallbackMapping;

  if (!resolvedMapping) {
    throw new Error(`No journal mapping available for intent "${intent}".`);
  }

  const amount = Number(entities.amount);
  const taxAmountRaw =
    entities.tax && typeof entities.tax.amount === "number"
      ? Number(entities.tax.amount)
      : entities.tax && typeof entities.tax.rate === "number"
        ? Number((amount * entities.tax.rate) / 100)
        : 0;
  const taxAmount = Number(taxAmountRaw.toFixed(2));
  const hasTax = taxAmount > 0;

  const description =
    entities.description ??
    `${intent.replace("_", " ")} for ${entities.counterparty ?? "unknown counterparty"}`;
  const memo = [
    entities.counterparty ? `Counterparty: ${entities.counterparty}` : null,
    entities.invoice_number ? `Invoice #: ${entities.invoice_number}` : null,
    entities.date ? `Date: ${format(new Date(entities.date), "dd MMM yyyy")}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const debitAccount = findAccountById(resolvedMapping.debit_account_id);
  const creditAccount = findAccountById(resolvedMapping.credit_account_id);
  const taxDebitAccount = resolvedMapping.tax_debit_account_id
    ? findAccountById(resolvedMapping.tax_debit_account_id)
    : null;
  const taxCreditAccount = resolvedMapping.tax_credit_account_id
    ? findAccountById(resolvedMapping.tax_credit_account_id)
    : null;

  let debitBaseAmount = amount;
  let creditBaseAmount = amount;

  if (hasTax && taxCreditAccount) {
    debitBaseAmount += taxAmount;
  }

  if (hasTax && taxDebitAccount) {
    creditBaseAmount += taxAmount;
  }

  const lines: JournalLine[] = [
    {
      account_id: debitAccount.id,
      debit: Number(debitBaseAmount.toFixed(2)),
      credit: 0,
      memo,
    },
    {
      account_id: creditAccount.id,
      debit: 0,
      credit: Number(creditBaseAmount.toFixed(2)),
      memo,
    },
  ];

  if (hasTax && taxDebitAccount) {
    lines.push({
      account_id: taxDebitAccount.id,
      debit: Number(taxAmount.toFixed(2)),
      credit: 0,
      memo,
    });
  }

  if (hasTax && taxCreditAccount) {
    lines.push({
      account_id: taxCreditAccount.id,
      debit: 0,
      credit: Number(taxAmount.toFixed(2)),
      memo,
    });
  }

  return { description, lines };
}

function inferMappingFromCodes(
  intent: DraftPayload["intent"],
  accounts: Account[],
  resolveByCode: (code: string) => Account | undefined,
): IntentAccountMapping | null {
  switch (intent) {
    case "create_invoice": {
      const receivable = resolveByCode("1100");
      const revenue = resolveByCode("4000");
      if (!receivable || !revenue) {
        throw new Error(
          "Missing default accounts for invoice intent (1100/4000). " +
          "Please create these accounts in the Chart of Accounts: " +
          "Code 1100 (Accounts Receivable) and Code 4000 (Sales Revenue). " +
          "Or go to Accounts → Intent Mappings to configure custom account mappings."
        );
      }
      return {
        intent,
        debit_account_id: receivable.id,
        credit_account_id: revenue.id,
        tax_debit_account_id: null,
        tax_credit_account_id: resolveByCode("2100")?.id ?? null,
      };
    }
    case "create_bill": {
      const expense = resolveByCode("5000");
      const payable = resolveByCode("2000");
      if (!expense || !payable) {
        throw new Error(
          "Missing default accounts for bill intent (5000/2000). " +
          "Please create these accounts in the Chart of Accounts: " +
          "Code 5000 (Expense) and Code 2000 (Accounts Payable). " +
          "Or go to Accounts → Intent Mappings to configure custom account mappings."
        );
      }
      return {
        intent,
        debit_account_id: expense.id,
        credit_account_id: payable.id,
        tax_debit_account_id: resolveByCode("5100")?.id ?? null,
        tax_credit_account_id: null,
      };
    }
    case "record_payment": {
      const cash = resolveByCode("1000");
      const receivable = resolveByCode("1100");
      if (!cash || !receivable) {
        throw new Error(
          "Missing default accounts for payment intent (1000/1100). " +
          "Please create these accounts in the Chart of Accounts: " +
          "Code 1000 (Cash) and Code 1100 (Accounts Receivable). " +
          "Or go to Accounts → Intent Mappings to configure custom account mappings."
        );
      }
      return {
        intent,
        debit_account_id: cash.id,
        credit_account_id: receivable.id,
        tax_debit_account_id: null,
        tax_credit_account_id: null,
      };
    }
    case "reconcile_bank":
      throw new Error("Bank reconciliation drafts must be resolved manually.");
    case "generate_report":
    default:
      return null;
  }
}


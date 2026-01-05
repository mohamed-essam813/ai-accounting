import { DraftPayload } from "@/lib/ai/schema";
import { Database } from "@/lib/database.types";
import { format } from "date-fns";

export type Account = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

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

export async function buildDefaultJournalLines(
  draft: DraftPayload,
  accounts: Account[],
  mapping?: IntentAccountMapping | null,
  options?: {
    prompt?: string;
    tenantId?: string;
    useRAG?: boolean;
  },
): Promise<{ description: string; lines: JournalLine[] }> {
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

  // Use AI-selected accounts if available (from draft.accounts)
  // Priority: AI-selected accounts > Fallback mapping (code-based inference)
  let resolvedMapping: IntentAccountMapping | null = null;

  if (draft.accounts) {
    // AI has suggested accounts - use them
    const { listAccounts } = await import("@/lib/data/accounts");
    const allAccounts = await listAccounts();
    const accountMap = new Map(allAccounts.map((acc) => [acc.id, acc]));
    
    // Helper to find account by ID, with fallback to fetching directly from DB if not in list
    const findAccount = async (suggestion: typeof draft.accounts.debit_account): Promise<Account | null> => {
      if (suggestion.existing_account_id) {
        // First try to find in the account list
        const found = accountMap.get(suggestion.existing_account_id);
        if (found) return found;
        
        // If not found in list (might be newly created), fetch directly from DB
        if (options?.tenantId) {
          const supabase = await import("@/lib/supabase/server").then((m) => m.createServerSupabaseClient());
          const { data: accountData, error } = await supabase
            .from("chart_of_accounts")
            .select("*")
            .eq("id", suggestion.existing_account_id)
            .eq("tenant_id", options.tenantId)
            .single();
          
          if (!error && accountData) {
            return {
              id: accountData.id,
              name: accountData.name,
              code: accountData.code,
              type: accountData.type,
              is_active: accountData.is_active,
              tenant_id: accountData.tenant_id,
              created_at: accountData.created_at,
              category: (accountData as any).category ?? null,
            } as Account;
          }
        }
        return null;
      }
      
      // If no existing_account_id, search by name as fallback
      return allAccounts.find(
        (acc) => acc.name.toLowerCase() === suggestion.suggested_name.toLowerCase() &&
                 acc.type === suggestion.suggested_type
      ) ?? null;
    };

    const debitAccount = await findAccount(draft.accounts.debit_account);
    const creditAccount = await findAccount(draft.accounts.credit_account);
    const taxDebitAccount = draft.accounts.tax_debit_account
      ? await findAccount(draft.accounts.tax_debit_account)
      : null;
    const taxCreditAccount = draft.accounts.tax_credit_account
      ? await findAccount(draft.accounts.tax_credit_account)
      : null;

    if (debitAccount && creditAccount) {
      resolvedMapping = {
        intent,
        debit_account_id: debitAccount.id,
        credit_account_id: creditAccount.id,
        tax_debit_account_id: taxDebitAccount?.id ?? null,
        tax_credit_account_id: taxCreditAccount?.id ?? null,
      };
    }
  }

  // Fallback to code-based inference (no manual mapping)
  if (!resolvedMapping) {
    resolvedMapping = inferMappingFromCodes(intent, accounts, resolveByCode);
  }

  if (!resolvedMapping) {
    throw new Error(
      `No journal mapping available for intent "${intent}". ` +
      `AI should have selected accounts automatically. If this error persists, please ensure the chart of accounts has the required default accounts (e.g., 1100 for AR, 2000 for AP, 4000 for Revenue). ` +
      `Draft created but blocked from posting until accounts are available.`
    );
  }

  // Validate mapping against account type constraints (from feedback)
  const { validateIntentMapping } = await import("./accounting/gl-mapping-validation");
  const validation = validateIntentMapping(resolvedMapping, accounts, intent);
  if (!validation.valid) {
    throw new Error(
      `Invalid account mapping for intent "${intent}": ${validation.errors.join("; ")}. ` +
      `Please update the intent mapping in Accounts → Intent Mappings. ` +
      `Draft created but blocked from posting until mapping is valid.`
    );
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

  const intentLabel = intent === "create_credit_note" 
    ? "Credit Note" 
    : intent === "create_debit_note"
    ? "Debit Note"
    : intent.replace("_", " ");
  const description =
    entities.description ??
    `${intentLabel} for ${entities.counterparty ?? "unknown counterparty"}`;
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

  // Handle credit notes and debit notes differently
  const isCreditNote = intent === "create_credit_note";
  const isDebitNote = intent === "create_debit_note";

  let debitBaseAmount = amount;
  let creditBaseAmount = amount;

  // For credit notes: DR Revenue + DR VAT, CR Receivable
  // For debit notes: DR Payable, CR Expense + CR VAT Input
  if (isCreditNote) {
    // Credit note: amount goes to revenue (debit), tax goes to VAT output (debit)
    debitBaseAmount = amount;
    if (hasTax && taxDebitAccount) {
      debitBaseAmount += taxAmount;
    }
    creditBaseAmount = amount + (hasTax ? taxAmount : 0);
  } else if (isDebitNote) {
    // Debit note: amount goes to payable (debit), expense and VAT are credited
    debitBaseAmount = amount + (hasTax ? taxAmount : 0);
    creditBaseAmount = amount;
    if (hasTax && taxCreditAccount) {
      creditBaseAmount += taxAmount;
    }
  } else {
    // Standard invoice/bill logic
    if (hasTax && taxCreditAccount) {
      debitBaseAmount += taxAmount;
    }

    if (hasTax && taxDebitAccount) {
      creditBaseAmount += taxAmount;
    }
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

  // Add tax lines
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
    case "create_credit_note": {
      // Credit Note (Customer): DR Sales Revenue, DR VAT Output, CR Accounts Receivable
      const revenue = resolveByCode("4000");
      const receivable = resolveByCode("1100");
      const vatOutput = resolveByCode("2100");
      if (!revenue || !receivable) {
        throw new Error(
          "Missing default accounts for credit note intent (4000/1100). " +
          "Please create these accounts in the Chart of Accounts: " +
          "Code 4000 (Sales Revenue) and Code 1100 (Accounts Receivable). " +
          "Or go to Accounts → Intent Mappings to configure custom account mappings."
        );
      }
      return {
        intent,
        debit_account_id: revenue.id,
        credit_account_id: receivable.id,
        tax_debit_account_id: vatOutput?.id ?? null,
        tax_credit_account_id: null,
      };
    }
    case "create_debit_note": {
      // Debit Note (Vendor): DR Accounts Payable, CR Expense, CR VAT Input
      const payable = resolveByCode("2000");
      const expense = resolveByCode("5000");
      const vatInput = resolveByCode("5100");
      if (!payable || !expense) {
        throw new Error(
          "Missing default accounts for debit note intent (2000/5000). " +
          "Please create these accounts in the Chart of Accounts: " +
          "Code 2000 (Accounts Payable) and Code 5000 (Expense). " +
          "Or go to Accounts → Intent Mappings to configure custom account mappings."
        );
      }
      return {
        intent,
        debit_account_id: payable.id,
        credit_account_id: expense.id,
        tax_debit_account_id: null,
        tax_credit_account_id: vatInput?.id ?? null,
      };
    }
    case "reconcile_bank":
      // Bank reconciliation: AI should select accounts based on transaction type
      // For loans: DR Bank (asset), CR Long-term Debt (liability)
      // For deposits: DR Bank (asset), CR AR/AP (asset) or Capital (equity)
      // For transfers: DR Bank (asset), CR Bank (asset)
      // Since AI should handle account selection, we don't provide a fallback here
      // If AI didn't select accounts, the error will be caught in buildDefaultJournalLines
      return null;
    case "generate_report":
    default:
      return null;
  }
}


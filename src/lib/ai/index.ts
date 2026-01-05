import { createHash } from "crypto";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { env } from "../env";
import { DraftSchema } from "./schema";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { Database } from "../database.types";
import { retrieveRelevantContext } from "./embeddings";

type PromptCacheRow = Database["public"]["Tables"]["ai_prompt_cache"]["Row"];
type UsageLogInsert = Database["public"]["Tables"]["ai_usage_logs"]["Insert"];
type PromptCacheUpdate = Database["public"]["Tables"]["ai_prompt_cache"]["Update"];
type PromptCacheInsert = Database["public"]["Tables"]["ai_prompt_cache"]["Insert"];

// Type-safe helper to work around Supabase type inference issues
function getPromptCacheTable(supabase: ReturnType<typeof createServiceSupabaseClient>) {
  return supabase.from("ai_prompt_cache") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: Pick<PromptCacheRow, "id" | "response_json" | "usage_count"> | null; error: unknown }>;
          };
        };
      };
    };
    update: (data: PromptCacheUpdate) => {
      eq: (column: string, value: string) => Promise<unknown>;
    };
    upsert: (data: PromptCacheInsert, options: { onConflict: string }) => Promise<unknown>;
  };
}

function getUsageLogsTable(supabase: ReturnType<typeof createServiceSupabaseClient>) {
  return supabase.from("ai_usage_logs") as unknown as {
    insert: (data: UsageLogInsert) => Promise<unknown>;
    select: (columns: string, options?: { count: string; head: boolean }) => {
      eq: (column: string, value: string) => {
        gte: (column: string, value: string) => Promise<{ count: number | null }>;
      };
    };
  };
}

// Using the latest model for best accuracy in accounting data extraction
// GPT-5.1 is the latest model (released Nov 2025) - use if available in your API
// Fallback to gpt-4o if GPT-5.1 is not available in your API tier
// Alternative: "gpt-4o-mini" for faster/cheaper (less accurate)
// Alternative: "o1-preview" or "o1-mini" for reasoning tasks (if available)
const MODEL_NAME = "gpt-5.1"; // Try "gpt-4o" if this fails
const DAILY_PROMPT_LIMIT = 500;

const openai = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
});

type ParsePromptContext = {
  tenantId: string;
  userId: string;
};

function estimateTokens(text: string) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function startOfUtcDay(date: Date) {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export async function parseAccountingPrompt(prompt: string, context: ParsePromptContext) {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is empty.");
  }

  const promptHash = createHash("sha256").update(trimmedPrompt).digest("hex");
  const supabase = createServiceSupabaseClient();
  const promptCache = getPromptCacheTable(supabase);
  const usageLogs = getUsageLogsTable(supabase);

  const cacheResult = await promptCache
    .select("id, response_json, usage_count")
    .eq("tenant_id", context.tenantId)
    .eq("prompt_hash", promptHash)
    .eq("model", MODEL_NAME)
    .maybeSingle();
  
  const cached = cacheResult.data;

  // Pre-check for loan keywords (needed for both cache and new requests)
  const promptLower = trimmedPrompt.toLowerCase();
  const isLoanTransaction = 
    promptLower.includes("loan") || 
    promptLower.includes("borrow") ||
    promptLower.includes("long-term loan") ||
    promptLower.includes("short-term loan") ||
    promptLower.includes("long term loan") ||
    promptLower.includes("short term loan");
  
  const hasBankName = /(emirates nbd|adcb|fab|hsbc|chase|bank of america|wells fargo|citibank|barclays|deutsche bank|standard chartered|dubai islamic|abu dhabi commercial|first abu dhabi|mashreq|rakbank)/i.test(trimmedPrompt);

  if (cached?.response_json) {
    let validated = DraftSchema.parse(cached.response_json);
    
    // Apply post-processing auto-correction to cached responses too
    const creditAccountIsLiability = validated.accounts?.credit_account?.suggested_type === "liability" ||
      validated.accounts?.credit_account?.suggested_name?.toLowerCase().includes("debt") ||
      validated.accounts?.credit_account?.suggested_name?.toLowerCase().includes("loan");
    
    // Auto-correct intent if needed (same logic as for new requests)
    if (validated.intent === "record_payment" && (isLoanTransaction || hasBankName || creditAccountIsLiability)) {
      validated = {
        ...validated,
        intent: "reconcile_bank" as const,
      };
    }

    const updateData: PromptCacheUpdate = {
      usage_count: (cached.usage_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const logData: UsageLogInsert = {
      tenant_id: context.tenantId,
      user_id: context.userId,
      prompt_hash: promptHash,
      model: MODEL_NAME,
      cache_hit: true,
      estimated_prompt_tokens: estimateTokens(trimmedPrompt),
      estimated_response_tokens: estimateTokens(JSON.stringify(validated)),
      total_tokens: estimateTokens(trimmedPrompt) + estimateTokens(JSON.stringify(validated)),
    };

    await Promise.all([
      promptCache.update(updateData).eq("id", cached.id),
      usageLogs.insert(logData),
    ]);

    return validated;
  }

  const todayStart = startOfUtcDay(new Date()).toISOString();
  const usageResult = await usageLogs
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", context.tenantId)
    .gte("created_at", todayStart);
  const usageToday = usageResult.count;

  if ((usageToday ?? 0) >= DAILY_PROMPT_LIMIT) {
    throw new Error(
      `Daily AI usage limit reached (${DAILY_PROMPT_LIMIT} requests). Try again tomorrow or contact an administrator.`,
    );
  }

  // RAG: Retrieve relevant context from embeddings, including accounts
  let ragContext = "";
  let accountsContext = "";
  try {
    // Get all accounts for the tenant to include in prompt
    const { listAccounts } = await import("@/lib/data/accounts");
    const accounts = await listAccounts();
    
    if (accounts.length > 0) {
      accountsContext = "\n\nAVAILABLE CHART OF ACCOUNTS:\n";
      accountsContext += "Select the most appropriate accounts from this list based on the user's prompt:\n";
      accounts.forEach((acc) => {
        accountsContext += `- ${acc.code} | ${acc.name} | Type: ${acc.type} | ID: ${acc.id}\n`;
      });
      accountsContext += "\nACCOUNT SELECTION RULES:\n";
      accountsContext += "1. First, check if an existing account matches the transaction description.\n";
      accountsContext += "   - For bank accounts: Search for accounts with the EXACT bank name (e.g., 'Emirates NBD Bank', 'ADCB', 'FAB') in the list above\n";
      accountsContext += "   - Match by name AND type (bank accounts are asset type)\n";
      accountsContext += "   - If found, use the account ID from the list above\n";
      accountsContext += "2. If no exact match exists, suggest a new account name and determine its type.\n";
      accountsContext += "   - For bank accounts: If the bank name is not in the list above, set existing_account_id to null\n";
      accountsContext += "3. Account Type Determination (CRITICAL - be accurate):\n";
      accountsContext += "   - REVENUE: Money coming in (sales, services, income, fees, subscriptions)\n";
      accountsContext += "   - EXPENSE: Money going out (costs, bills, purchases, salaries, rent, utilities)\n";
      accountsContext += "   - ASSET: Things owned (cash, bank, inventory, equipment, receivables)\n";
      accountsContext += "   - LIABILITY: Money owed (payables, loans, taxes, debts)\n";
      accountsContext += "   - EQUITY: Ownership (capital, retained earnings, shares)\n";
      accountsContext += "4. Account Category (for Assets and Liabilities only):\n";
      accountsContext += "   - CURRENT: Short-term (expected to be used/paid within 1 year)\n";
      accountsContext += "     Examples: Cash, Accounts Receivable, Inventory, Accounts Payable, Short-term Debt\n";
      accountsContext += "   - NON_CURRENT: Long-term (expected to last/be paid over 1 year)\n";
      accountsContext += "     Examples: Property/Equipment, Long-term Investments, Long-term Debt\n";
      accountsContext += "   - For Revenue, Expense, Equity: category is null (not applicable)\n";
      accountsContext += "4. Transaction Patterns:\n";
      accountsContext += "   - Customer invoices: DR Accounts Receivable (asset), CR Revenue account\n";
      accountsContext += "   - Vendor bills: DR Expense/Asset account, CR Accounts Payable (liability)\n";
      accountsContext += "   - Payments: DR/CR Cash/Bank (asset) and AR/AP\n";
      accountsContext += "5. Confidence Scoring:\n";
      accountsContext += "   - If you're very certain about account type: confidence >= 0.9\n";
      accountsContext += "   - If somewhat certain: confidence 0.7-0.89\n";
      accountsContext += "   - If uncertain: confidence < 0.7 (user will be warned)\n";
      accountsContext += "6. Provide reasoning for account type selection in the 'reasoning' field.\n";
    }

    // Retrieve relevant context from embeddings
    const relevantContexts = await retrieveRelevantContext(trimmedPrompt, context.tenantId, {
      limit: 5,
      entityTypes: ["account", "transaction", "mapping"],
      similarityThreshold: 0.7,
    });

    if (relevantContexts.length > 0) {
      ragContext = "\n\nRelevant context from your accounting system:\n";
      relevantContexts.forEach((ctx, idx) => {
        ragContext += `${idx + 1}. ${ctx.content}`;
        if (ctx.metadata) {
          const meta = ctx.metadata;
          if (meta.account_code) ragContext += ` (Account: ${meta.account_code})`;
          if (meta.transaction_date) ragContext += ` (Date: ${meta.transaction_date})`;
        }
        ragContext += "\n";
      });
    }
  } catch (ragError) {
    // If RAG fails, continue without context (graceful degradation)
  }

  const todayDate = new Date().toISOString().split('T')[0];

  const fullPrompt = [
        "You are an accounting parser. Extract accounting information from the user's prompt and return a structured JSON object.",
    "",
    ...(isLoanTransaction || hasBankName ? [
      "⚠️⚠️⚠️ CRITICAL: THIS PROMPT CONTAINS LOAN OR BANK KEYWORDS ⚠️⚠️⚠️",
      "YOU MUST USE 'reconcile_bank' INTENT, NOT 'record_payment'",
      "The intent field MUST be set to: \"reconcile_bank\"",
      "DO NOT use 'record_payment' for this transaction",
      "",
    ] : []),
    "CRITICAL INTENT DETECTION RULES (READ FIRST):",
    "1. If the prompt contains ANY of these keywords: 'loan', 'borrow', 'long-term loan', 'short-term loan', 'deposit', 'bank transfer', 'bank fee' → MUST use 'reconcile_bank' intent",
    "2. If the prompt mentions a specific bank name (e.g., 'Emirates NBD Bank', 'ADCB', 'FAB', 'HSBC', 'Chase', 'Bank of America') → MUST use 'reconcile_bank' intent",
    "3. If the credit_account will be a liability type (Long-term Debt, Short-term Debt, Loan, etc.) → MUST use 'reconcile_bank' intent, NOT 'record_payment'",
    "4. 'record_payment' is ONLY for customer/supplier payments (AR/AP transactions), NEVER for loans or bank transactions",
    "5. Examples that MUST be 'reconcile_bank':",
    "   - 'loan from Emirates NBD Bank' → reconcile_bank",
    "   - 'Create a journal entry for a long term loan from Emirates NBD Bank' → reconcile_bank",
    "   - 'borrow from ADCB' → reconcile_bank",
    "   - 'deposit to FAB' → reconcile_bank",
        "",
        "REQUIRED FORMAT:",
        "{",
        '  "intent": "create_invoice" | "create_bill" | "record_payment" | "reconcile_bank" | "generate_report" | "create_credit_note" | "create_debit_note",',
        '  "entities": {',
        '    "amount": number (required),',
    '    "currency": string (required, e.g., "USD", "EUR", "AED"),',
    '    "date": string (required, format: YYYY-MM-DD) - USE TODAY IF NOT MENTIONED: ' + todayDate,
        '    "counterparty": string | null (optional),',
        '    "description": string | null (optional),',
        '    "tax": { "rate": number, "amount": number | null } | null (optional),',
        '    "due_date": string | null (optional, format: YYYY-MM-DD),',
        '    "invoice_number": string | null (optional)',
        "  },",
    '  "confidence": number (required, between 0 and 1),',
    '  "accounts": {',
    '    "debit_account": {',
    '      "suggested_name": string (required, e.g., "Consulting Revenue", "Office Supplies", "Legal Expenses"),',
    '      "suggested_type": "asset" | "liability" | "equity" | "revenue" | "expense" (required),',
    '      "suggested_category": "current" | "non_current" | null (optional, only for assets/liabilities)',
    '      "existing_account_id": string | null (optional, UUID if exact match found in chart above),',
    '      "confidence": number (required, 0-1, how certain you are about the type),',
    '      "reasoning": string (optional, explain why this type and category were chosen)',
    '    },',
    '    "credit_account": { ... same structure ... },',
    '    "tax_debit_account": { ... same structure ... } (OPTIONAL - ONLY include if tax/VAT is explicitly mentioned in the prompt, otherwise OMIT this field completely),',
    '    "tax_credit_account": { ... same structure ... } (OPTIONAL - ONLY include if tax/VAT is explicitly mentioned in the prompt, otherwise OMIT this field completely)',
    "  } (optional, but recommended for new accounts)",
    "",
    "CRITICAL RULE FOR TAX ACCOUNTS:",
    "  - If the prompt mentions tax, VAT, or a tax rate (e.g., 'with 5% VAT', 'including tax', 'tax rate 10%'), then include tax_debit_account and tax_credit_account with proper suggested_name values",
    "  - If the prompt does NOT mention tax/VAT at all, DO NOT include tax_debit_account and tax_credit_account fields in the accounts object",
    "  - NEVER include tax accounts with empty suggested_name - either include them with valid names or omit them completely",
        "}",
        "",
        `User Prompt: ${trimmedPrompt}`,
        accountsContext,
        ragContext,
        "",
        "INSTRUCTIONS:",
        "- Extract the intent from the prompt:",
        "  * 'create_invoice' for sales invoices to customers",
    "  * 'create_bill' for supplier bills/vendor invoices (when user says 'bill', 'invoice from supplier', 'vendor invoice')",
        "  * 'create_credit_note' for customer credit notes (returns, refunds, adjustments)",
        "  * 'create_debit_note' for vendor debit notes (corrections to supplier bills)",
    "  * 'record_payment' for customer or supplier payments ONLY (receiving payment from customer or paying supplier) - NEVER use for loans, bank transactions, or any transaction involving a bank name",
    "  * 'reconcile_bank' for ALL bank-related transactions including:",
    "    - Loans: 'loan from bank', 'long-term loan', 'short-term loan', 'loan from [Bank Name]', 'borrow from [Bank Name]', 'journal entry for a loan', 'long term loan'",
    "    - Deposits: 'deposit to [Bank Name]', 'deposit at [Bank Name]'",
    "    - Bank transfers, bank fees, interest, or ANY transaction mentioning a specific bank name (e.g., 'Emirates NBD Bank', 'ADCB', 'FAB', 'HSBC', etc.)",
    "  * CRITICAL INTENT SELECTION RULES:",
    "    - If the prompt contains ANY of these words: 'loan', 'borrow', 'deposit', 'bank transfer', 'bank fee', OR mentions a bank name → MUST use 'reconcile_bank', NOT 'record_payment'",
    "    - If the credit_account will be a liability type (Long-term Debt, Short-term Debt, Loan, etc.) → MUST use 'reconcile_bank', NOT 'record_payment'",
    "    - 'record_payment' ONLY allows asset accounts for credit_account (AR/AP). If credit_account is liability → MUST be 'reconcile_bank'",
    "  * Example: 'loan from Emirates NBD Bank' → MUST be 'reconcile_bank', NOT 'record_payment'",
    "  * Example: 'Create a journal entry for a long term loan from Emirates NBD Bank' → MUST be 'reconcile_bank', NOT 'record_payment' (because it mentions 'loan' and 'Emirates NBD Bank')",
    "  * Example: 'charge it to long term loan' → credit_account is 'Long-term Debt' (liability) → MUST use 'reconcile_bank', NOT 'record_payment'",
        "- Extract amount, currency, date, and other relevant fields",
    "- DATE HANDLING (CRITICAL - ALWAYS PROVIDE A DATE):",
    "  * If a date is explicitly mentioned in the prompt, use that date in YYYY-MM-DD format",
    "  * If no date is mentioned, you MUST use today's date: " + todayDate,
    "  * NEVER leave date as null or empty - always provide a valid date in YYYY-MM-DD format",
    "  * Date must always be in YYYY-MM-DD format (e.g., 2024-11-25)",
    "- CURRENCY HANDLING:",
    "  * Extract currency from the prompt (USD, EUR, AED, etc.)",
    "  * If currency code is mentioned (like 'AED'), use that exact code",
    "  * If only symbol is mentioned (like '$'), infer the currency (default to USD for $)",
    "- If a field is not mentioned, use null for optional fields (but date and currency are always required)",
        "- Confidence should reflect how certain you are (0.0 to 1.0)",
        "- Use the context above to understand account names and company terminology",
    "- ACCOUNT SELECTION (IMPORTANT):",
    "  * Check the chart of accounts above for existing accounts that match the transaction",
    "  * For bank accounts: Search for accounts with the EXACT bank name (e.g., 'Emirates NBD Bank', 'ADCB', 'FAB') in the chart of accounts",
    "  * If an exact match exists (same name AND same type), set 'existing_account_id' to that account's ID",
    "  * If no exact match exists, you MUST set 'existing_account_id' to null and suggest creating the account",
    "  * CRITICAL: For bank accounts, if the bank name is mentioned but not found in chart of accounts, set existing_account_id to null (do NOT use a similar account name)",
    "  * If no match exists, suggest a new account name and determine its type carefully",
    "  * For account type, be very careful:",
    "    - Revenue = money coming in (sales, services, income)",
    "    - Expense = money going out (costs, bills, purchases, legal fees, office supplies, etc.)",
    "    - Asset = things owned (cash, inventory, equipment)",
    "    - Liability = money owed (payables, loans, taxes)",
    "  * For Assets and Liabilities, also determine category:",
    "    - CURRENT = short-term (used/paid within 1 year): Cash, AR, Inventory, AP, Short-term Debt",
    "    - NON_CURRENT = long-term (over 1 year): Equipment, Long-term Investments, Long-term Debt",
    "  * Set confidence high (>=0.9) if you're certain about the type, lower if uncertain",
    "  * Provide reasoning for your type and category selection",
    "  * For invoices: debit_account should be AR (asset, current), credit_account should be Revenue",
    "  * For bills: debit_account should be Expense (the expense category mentioned, e.g., 'Legal Expenses', 'Office Supplies'), credit_account should be AP (liability, current)",
    "  * CRITICAL: When user says 'book it under X', 'categorize as X', 'under X', 'book under X', or similar phrases, X is the EXACT expense account name for the debit_account",
    "  * Example: 'book it under Legal Expenses' means debit_account.suggested_name = 'Legal Expenses' (exact match, not 'Legal Expense' or 'Consulting Expense') and suggested_type = 'expense'",
    "  * Example: 'book it under Office Supplies' means debit_account.suggested_name = 'Office Supplies' (not 'Office Supply' or 'Supplies')",
    "  * Always use the EXACT account name as mentioned in the prompt - do not substitute with similar account names",
    "  * If the user says 'book it under Legal Expenses', you MUST use 'Legal Expenses' as the suggested_name, even if there's a similar account like 'Legal Expense' or 'Consulting Expense' in the chart of accounts",
    "  * DO NOT use generic account names like 'Consulting Expense' or 'General Expense' when the user specifies a different account name",
    "  * The phrase 'book it under X' or 'book under X' is a DIRECT instruction to use X as the account name - follow it exactly",
  "  * For payments (record_payment intent) and bank reconciliation (reconcile_bank intent) and any transaction involving cash/bank:",
  "    - If the prompt explicitly mentions a SPECIFIC bank name (e.g., 'Emirates NBD Bank', 'ADCB', 'FAB', 'ENBD', 'from [Bank Name]', 'at [Bank Name]') → set debit_account.suggested_name to that EXACT bank name and set existing_account_id ONLY if that exact bank account exists in the chart of accounts",
  "    - If the prompt explicitly mentions 'cash', 'Cash', or 'code 1000' AND the user is clearly choosing cash (not ambiguous) → set debit_account.suggested_name = 'Cash' and set existing_account_id to the Cash account (code 1000) if it exists",
  "    - CRITICAL FOR LOANS, DIVIDENDS, CAPITAL CONTRIBUTIONS, etc.: If the prompt does NOT explicitly mention a specific bank name or cash → set existing_account_id to null (do NOT default to Cash), set suggested_name to a generic name like 'Cash' or 'Bank Account', and set suggested_type to 'asset' and suggested_category to 'current'",
  "    - CRITICAL: Do NOT automatically set existing_account_id to Cash (1000) unless the prompt explicitly and clearly mentions 'cash' or 'Cash' as the chosen method. For ambiguous cases (like 'Record a loan'), leave existing_account_id as null to trigger cash/bank selection dialog",
  "    - Examples that MUST have existing_account_id = null:",
  "      * 'Record a loan of AED 100,000' → existing_account_id = null (user didn't specify cash or bank)",
  "      * 'Pay dividends of AED 50,000' → existing_account_id = null (user didn't specify cash or bank)",
  "      * 'Record capital contribution' → existing_account_id = null (user didn't specify cash or bank)",
  "      * 'Record interest received' → existing_account_id = null (user didn't specify cash or bank)",
  "      * These should trigger cash/bank selection dialog",
  "    - Examples that CAN have existing_account_id set:",
  "      * 'Record a loan of AED 100,000 through Cash' → existing_account_id = Cash account ID (user specified cash)",
  "      * 'Record a loan from Emirates NBD Bank' → existing_account_id = Emirates NBD Bank account ID if it exists (user specified bank)",
  "    - This applies to: record_payment, reconcile_bank (loans, deposits, dividends, capital contributions, interest, bank fees, transfers), and any other transaction where the debit or credit account could be cash/bank",
  "  * For bank reconciliation (reconcile_bank intent - loans, deposits, dividends, capital contributions, transfers, etc.):",
  "    - debit_account should be the SPECIFIC Bank account mentioned in the prompt (asset, current) if mentioned",
  "    - If no specific bank is mentioned, set existing_account_id to null to trigger cash/bank selection",
  "    - credit_account can be AR/AP (asset), Loan (liability), Capital/Equity (equity), Revenue (for interest received), or Expense (for interest paid/fees) depending on the transaction",
    "  * CRITICAL: When user mentions a bank name (e.g., 'Emirates NBD Bank', 'ADCB', 'FAB', 'from [Bank Name]', 'at [Bank Name]'), extract that EXACT bank name as the debit_account.suggested_name",
    "  * Example: 'loan from Emirates NBD Bank' → reconcile_bank intent (NOT record_payment), debit_account.suggested_name = 'Emirates NBD Bank' (exact match), debit_account.suggested_type = 'asset', debit_account.suggested_category = 'current', credit_account = Long-term Debt or Loan (liability)",
    "  * Example: 'Create a journal entry for a long term loan from Emirates NBD Bank' → reconcile_bank intent (NOT record_payment), debit_account.suggested_name = 'Emirates NBD Bank', credit_account.suggested_name = 'Long-term Debt' (liability)",
    "  * Example: 'deposit to ADCB' → reconcile_bank intent, debit_account.suggested_name = 'ADCB' (exact match), debit_account.suggested_type = 'asset', debit_account.suggested_category = 'current'",
    "  * Bank accounts are ALWAYS asset type, current category, and should be in code range 1000-1099",
    "  * CRITICAL FOR BANK ACCOUNTS: If the bank account name is mentioned (e.g., 'Emirates NBD Bank', 'ADCB', 'FAB') but doesn't exist in the chart of accounts above, you MUST:",
    "    - Set existing_account_id to null (do NOT leave it empty or use a different account)",
    "    - Set suggested_name to the EXACT bank name mentioned in the prompt",
    "    - Set suggested_type to 'asset'",
    "    - Set suggested_category to 'current'",
    "    - This will trigger the account confirmation dialog so the user can create the bank account",
    "  * CRITICAL RULE: If the credit_account is a liability type (like 'Long-term Debt', 'Loan', 'Short-term Debt'), you MUST use 'reconcile_bank' intent, NOT 'record_payment'. 'record_payment' only allows asset accounts for credit_account.",
    "  * TAX ACCOUNTS (CRITICAL):",
    "    - ONLY include tax_debit_account and tax_credit_account if tax/VAT is explicitly mentioned in the prompt",
    "    - Examples of tax mentions: 'with VAT', 'including 5% tax', 'tax rate 10%', 'VAT included'",
    "    - If the prompt does NOT mention tax/VAT, DO NOT include tax_debit_account and tax_credit_account fields at all",
    "    - NEVER create tax accounts with empty suggested_name - if you include them, they must have valid names",
    "    - If tax is mentioned but you're unsure about tax accounts, it's better to omit them than to include them with empty names",
        "",
        "Return ONLY the JSON object, no additional text or explanation.",
  ].join("\n");

  let object;
  try {
    const result = await generateObject({
      model: openai(MODEL_NAME),
      schema: DraftSchema,
      prompt: fullPrompt,
      temperature: 0.2,
      maxOutputTokens: 1000, // Increased from 500 to allow more detailed responses
    });
    object = result.object;
  } catch (error) {
    
    // Log more details for schema validation errors
    if (error instanceof Error) {
      // Check if it's a schema validation error or any parsing error
      const errorMessage = error.message.toLowerCase();
      const isSchemaError = 
        errorMessage.includes("schema") || 
        errorMessage.includes("no object generated") ||
        errorMessage.includes("validation") ||
        errorMessage.includes("parse") ||
        errorMessage.includes("invalid");
      
      if (isSchemaError) {
        throw new Error(
          `AI parsing failed: The prompt couldn't be parsed into accounting data. ` +
          `Please make sure your prompt includes: ` +
          `- An accounting action (invoice, bill, payment, etc.) ` +
          `- An amount and currency ` +
          `- A date (or it will use today's date automatically) ` +
          `Example: "Create a bill of AED 10,000 under the name of Saad & Co. and book it under Legal Expenses"`
        );
      }
      
      if (error.message.includes("API key")) {
        throw new Error("OpenAI API key is invalid or not configured. Please check your OPENAI_API_KEY environment variable.");
      }
      if (error.message.includes("rate limit") || error.message.includes("quota") || error.message.includes("insufficient_quota")) {
        throw new Error(
          "OpenAI API quota exceeded. " +
          "If you're on the free tier, you may have reached the usage limit. " +
          "Please add payment method at https://platform.openai.com/account/billing or try again later."
        );
      }
      if (error.message.includes("billing")) {
        throw new Error(
          "OpenAI billing required. " +
          "Please add a payment method at https://platform.openai.com/account/billing to continue using the API."
        );
      }
      if (error.message.includes("model") || error.message.includes("not found") || error.message.includes("does not exist")) {
        // If GPT-5.1 is not available, suggest fallback
        const fallbackModel = MODEL_NAME === "gpt-5.1" ? "gpt-4o" : "gpt-4o-mini";
        throw new Error(
          `OpenAI model "${MODEL_NAME}" is not available in your API tier. ` +
          `Try using "${fallbackModel}" instead. ` +
          `Update MODEL_NAME in src/lib/ai/index.ts (line 51) to: "${fallbackModel}"`
        );
      }
      throw new Error(`AI parsing failed: ${error.message}`);
    }
    throw new Error("AI parsing failed: Unknown error from OpenAI API");
  }

  let validated = DraftSchema.parse(object);
  
  // POST-PROCESSING: Auto-correct intent if AI made a mistake
  // Safety net: If AI returned 'record_payment' but credit account is liability or prompt contains loan keywords,
  // automatically correct to 'reconcile_bank'
  // Note: promptLower, isLoanTransaction, and hasBankName are already declared above
  const creditAccountIsLiability = validated.accounts?.credit_account?.suggested_type === "liability" ||
    validated.accounts?.credit_account?.suggested_name?.toLowerCase().includes("debt") ||
    validated.accounts?.credit_account?.suggested_name?.toLowerCase().includes("loan");
  
  // Auto-correct intent if needed
  if (validated.intent === "record_payment" && (isLoanTransaction || hasBankName || creditAccountIsLiability)) {
    validated = {
      ...validated,
      intent: "reconcile_bank" as const,
    };
  }
  
  const timestamp = new Date().toISOString();

  const cacheInsert: PromptCacheInsert = {
    tenant_id: context.tenantId,
    prompt_hash: promptHash,
    prompt_text: trimmedPrompt,
    model: MODEL_NAME,
    response_json: validated,
    usage_count: 1,
    created_at: timestamp,
    updated_at: timestamp,
    last_used_at: timestamp,
  };

  const usageLogInsert: UsageLogInsert = {
    tenant_id: context.tenantId,
    user_id: context.userId,
    prompt_hash: promptHash,
    model: MODEL_NAME,
    cache_hit: false,
    estimated_prompt_tokens: estimateTokens(trimmedPrompt),
    estimated_response_tokens: estimateTokens(JSON.stringify(validated)),
    total_tokens: estimateTokens(trimmedPrompt) + estimateTokens(JSON.stringify(validated)),
  };

  await Promise.all([
    promptCache.upsert(cacheInsert, {
      onConflict: "tenant_id,prompt_hash,model",
    }),
    usageLogs.insert(usageLogInsert),
  ]);

  return validated;
}


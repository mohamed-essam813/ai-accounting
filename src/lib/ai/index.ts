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

const MODEL_NAME = "gpt-5.1";
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

  if (cached?.response_json) {
    const validated = DraftSchema.parse(cached.response_json);

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

  // Load chart of accounts for the tenant
  let coaSection = "";
  try {
    const { listAccounts } = await import("@/lib/data/accounts");
    const accounts = await listAccounts();
    if (accounts.length > 0) {
      coaSection = "CHART OF ACCOUNTS (always prefer existing accounts over creating new ones):\n";
      for (const acc of accounts) {
        coaSection += `  ${acc.code} | ${acc.name} | ${acc.type}${acc.category ? ` (${acc.category})` : ""} | id:${acc.id}\n`;
      }
    }
  } catch {
    // Continue without CoA — AI will suggest new accounts
  }

  // RAG: retrieve relevant past context
  let ragSection = "";
  try {
    const contexts = await retrieveRelevantContext(trimmedPrompt, context.tenantId, {
      limit: 3,
      entityTypes: ["account", "transaction", "mapping"],
      similarityThreshold: 0.75,
    });
    if (contexts.length > 0) {
      ragSection = "\nRELEVANT PAST CONTEXT:\n";
      for (const ctx of contexts) {
        ragSection += `  - ${ctx.content}`;
        if (ctx.metadata?.account_code) ragSection += ` (account: ${ctx.metadata.account_code})`;
        ragSection += "\n";
      }
    }
  } catch {
    // Graceful degradation
  }

  const todayDate = new Date().toISOString().split("T")[0];

  const systemPrompt = [
    "You are an expert UAE accounting engine operating under IFRS standards and UAE VAT Law.",
    "Your job: analyse the transaction below and return a structured JSON object.",
    "",
    "━━━ UAE VAT RULES ━━━",
    "• Standard rate: 5% on taxable supplies (goods and services).",
    "• OUTPUT VAT (sales): credit VAT Payable — use account code 2100 if it exists.",
    "• INPUT VAT (purchases): debit VAT Recoverable — use account code 1150 if it exists.",
    "• Apply VAT when the prompt mentions VAT, tax, 5%, or the transaction is a standard taxable supply.",
    "• Zero-rated / exempt: omit VAT lines and set entities.tax to null.",
    "",
    "━━━ DEFAULT DOUBLE-ENTRY PATTERNS ━━━",
    "INVOICE (sale to customer):",
    "  DR  Accounts Receivable (1100)  — total incl. VAT",
    "  CR  Sales Revenue (4000)         — net amount excl. VAT",
    "  CR  VAT Payable (2100)           — VAT amount (if applicable)",
    "",
    "BILL (purchase from supplier):",
    "  DR  [Expense or Asset account]  — net amount excl. VAT",
    "  DR  VAT Recoverable (1150)      — VAT amount (if applicable)",
    "  CR  Accounts Payable (2000)     — total incl. VAT",
    "",
    "PAYMENT RECEIVED (from customer):",
    "  DR  Bank / Cash account         — amount",
    "  CR  Accounts Receivable (1100)  — amount",
    "",
    "PAYMENT SENT (to supplier):",
    "  DR  Accounts Payable (2000)     — amount",
    "  CR  Bank / Cash account         — amount",
    "",
    "LOAN RECEIVED:",
    "  DR  Bank / Cash account         — amount",
    "  CR  Loan Payable (liability)    — amount",
    "",
    "LOAN REPAYMENT:",
    "  DR  Loan Payable (liability)    — amount",
    "  CR  Bank / Cash account         — amount",
    "",
    "ADVANCE RECEIVED (from customer):",
    "  DR  Bank / Cash account         — amount",
    "  CR  Customer Deposits (2400 or similar liability)",
    "",
    "ADVANCE PAID (to supplier):",
    "  DR  Prepaid / Advances (1350 or similar asset)",
    "  CR  Bank / Cash account         — amount",
    "",
    "CREDIT NOTE (sales return):",
    "  DR  Sales Revenue (4000)        — net",
    "  DR  VAT Payable (2100)          — VAT (if original had VAT)",
    "  CR  Accounts Receivable (1100)  — total incl. VAT",
    "",
    "DEBIT NOTE (purchase return):",
    "  DR  Accounts Payable (2000)     — total incl. VAT",
    "  CR  [Expense / Asset account]   — net",
    "  CR  VAT Recoverable (1150)      — VAT (if original had VAT)",
    "",
    coaSection,
    ragSection,
    "━━━ INTENT MAPPING ━━━",
    "Map the transaction to one of these intents:",
    "  create_invoice   — sale to a customer (AR side)",
    "  create_bill      — purchase from a supplier (AP side)",
    "  record_payment   — cash/bank movement settling AR or AP",
    "  reconcile_bank   — any other cash/bank/loan/equity journal",
    "  create_credit_note — sales return or customer refund",
    "  create_debit_note  — purchase return or vendor credit",
    "",
    "━━━ ACCOUNT SELECTION ━━━",
    "1. Always prefer an existing account from the Chart of Accounts above (set existing_account_id to its id).",
    "2. If no suitable account exists, set existing_account_id to null and suggest a name and type.",
    "3. For cash/bank accounts not explicitly named: set existing_account_id to null (triggers selection dialog).",
    "4. For the main debit_account and credit_account, pick the PRIMARY debit and credit lines",
    "   (e.g. AR for invoice debit, Revenue for invoice credit).",
    "5. Use tax_credit_account for output VAT (sales), tax_debit_account for input VAT (purchases).",
    "",
    `TODAY'S DATE: ${todayDate}`,
    "",
    "━━━ TRANSACTION ━━━",
    trimmedPrompt,
    "",
    "━━━ INSTRUCTIONS ━━━",
    "1. Determine the transaction type and intent.",
    "2. Extract: counterparty, amount (is it gross or net?), date (use today if not stated), currency (default AED).",
    "3. Apply UAE 5% VAT if applicable.",
    "4. Generate ALL required journal lines (journal_lines array).",
    "5. SELF-CHECK: sum of all debit values must equal sum of all credit values. Set is_balanced accordingly.",
    "6. For entities.amount use the SUBTOTAL (net of VAT). For entities.tax.amount use the VAT amount.",
    "7. Set confidence ≥ 0.9 when the transaction is unambiguous; lower when uncertain.",
    "",
    "Return ONLY valid JSON — no markdown, no commentary.",
  ].join("\n");

  let object;
  try {
    const result = await generateObject({
      model: openai(MODEL_NAME),
      schema: DraftSchema,
      prompt: systemPrompt,
      temperature: 0.1,
      maxOutputTokens: 1500,
    });
    object = result.object;
  } catch (error) {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes("schema") ||
        msg.includes("no object generated") ||
        msg.includes("validation") ||
        msg.includes("parse") ||
        msg.includes("invalid")
      ) {
        throw new Error(
          "AI parsing failed: the prompt couldn't be converted into accounting data. " +
          "Please include an action (invoice, bill, payment), an amount, and a currency. " +
          'Example: "Create an invoice for AED 5,000 to Acme Corp on 2025-01-15"',
        );
      }
      if (error.message.includes("API key")) {
        throw new Error("OpenAI API key is invalid or not configured. Check your OPENAI_API_KEY environment variable.");
      }
      if (error.message.includes("rate limit") || error.message.includes("quota") || error.message.includes("insufficient_quota")) {
        throw new Error(
          "OpenAI API quota exceeded. Add a payment method at https://platform.openai.com/account/billing or try again later.",
        );
      }
      if (error.message.includes("model") || error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(
          `OpenAI model "${MODEL_NAME}" is not available in your API tier. ` +
          `Update MODEL_NAME in src/lib/ai/index.ts to "gpt-4o-mini" or another available model.`,
        );
      }
      throw new Error(`AI parsing failed: ${error.message}`);
    }
    throw new Error("AI parsing failed: unknown error from OpenAI API");
  }

  const validated = DraftSchema.parse(object);

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
    estimated_prompt_tokens: estimateTokens(systemPrompt),
    estimated_response_tokens: estimateTokens(JSON.stringify(validated)),
    total_tokens: estimateTokens(systemPrompt) + estimateTokens(JSON.stringify(validated)),
  };

  await Promise.all([
    promptCache.upsert(cacheInsert, {
      onConflict: "tenant_id,prompt_hash,model",
    }),
    usageLogs.insert(usageLogInsert),
  ]);

  return validated;
}

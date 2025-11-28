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

  // RAG: Retrieve relevant context from embeddings
  let ragContext = "";
  try {
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
    console.warn("RAG retrieval failed, continuing without context:", ragError);
  }

  let object;
  try {
    const result = await generateObject({
      model: openai(MODEL_NAME),
      schema: DraftSchema,
      prompt: [
        "You are an accounting parser. Extract accounting information from the user's prompt and return a structured JSON object.",
        "",
        "REQUIRED FORMAT:",
        "{",
        '  "intent": "create_invoice" | "create_bill" | "record_payment" | "reconcile_bank" | "generate_report",',
        '  "entities": {',
        '    "amount": number (required),',
        '    "currency": string (required, e.g., "USD", "EUR"),',
        '    "date": string (required, format: YYYY-MM-DD),',
        '    "counterparty": string | null (optional),',
        '    "description": string | null (optional),',
        '    "tax": { "rate": number, "amount": number | null } | null (optional),',
        '    "due_date": string | null (optional, format: YYYY-MM-DD),',
        '    "invoice_number": string | null (optional)',
        "  },",
        '  "confidence": number (required, between 0 and 1)',
        "}",
        "",
        `User Prompt: ${trimmedPrompt}`,
        ragContext,
        "",
        "INSTRUCTIONS:",
        "- Extract the intent from the prompt (invoice, bill, payment, etc.)",
        "- Extract amount, currency, date, and other relevant fields",
        "- If a field is not mentioned, use null for optional fields",
        "- Date must be in YYYY-MM-DD format",
        "- Confidence should reflect how certain you are (0.0 to 1.0)",
        "- Use the context above to understand account names and company terminology",
        "",
        "Return ONLY the JSON object, no additional text or explanation.",
      ].join("\n"),
      temperature: 0.2,
      maxOutputTokens: 500,
    });
    object = result.object;
  } catch (error) {
    console.error("OpenAI API error:", error);
    
    // Log more details for schema validation errors
    if (error instanceof Error) {
      // Check if it's a schema validation error
      if (error.message.includes("schema") || error.message.includes("No object generated")) {
        console.error("Schema validation failed. This might mean:");
        console.error("1. The prompt is too ambiguous or unclear");
        console.error("2. The AI couldn't extract required fields (amount, currency, date)");
        console.error("3. The prompt doesn't contain accounting information");
        console.error("Original prompt:", trimmedPrompt);
        
        throw new Error(
          `AI parsing failed: The prompt couldn't be parsed into accounting data. ` +
          `Please make sure your prompt includes: ` +
          `- An accounting action (invoice, bill, payment, etc.) ` +
          `- An amount and currency ` +
          `- A date ` +
          `Example: "Create an invoice for $500 USD to Acme Corp on 2024-11-25"`
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
          `Update MODEL_NAME in src/lib/ai/index.ts (line 48) to: "${fallbackModel}"`
        );
      }
      throw new Error(`AI parsing failed: ${error.message}`);
    }
    throw new Error("AI parsing failed: Unknown error from OpenAI API");
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


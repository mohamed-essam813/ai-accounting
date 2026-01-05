import { z } from "zod";

export const PromptIntentEnum = z.enum([
  "create_invoice",
  "create_bill",
  "record_payment",
  "reconcile_bank",
  "generate_report",
  "create_credit_note",
  "create_debit_note",
]);

export const DraftEntitiesSchema = z.object({
  amount: z.number(),
  currency: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  counterparty: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tax: z
    .object({
      rate: z.number(),
      amount: z.number().nullable(),
    })
    .nullable()
    .optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .nullable()
    .optional(),
  invoice_number: z.string().nullable().optional(),
});

const AccountSuggestionSchema = z.object({
  suggested_name: z.string().min(1, "Account name is required"),
  suggested_type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  suggested_category: z.enum(["current", "non_current"]).nullable().optional(), // Only for assets/liabilities
  existing_account_id: z.string().uuid().nullable().optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(), // AI explanation for type and category selection
});

export const DraftSchema = z.object({
  intent: PromptIntentEnum,
  entities: DraftEntitiesSchema,
  confidence: z.number().min(0).max(1),
  accounts: z
    .object({
      debit_account: AccountSuggestionSchema,
      credit_account: AccountSuggestionSchema,
      tax_debit_account: AccountSuggestionSchema.optional(), // Can be null or omitted if no tax
      tax_credit_account: AccountSuggestionSchema.optional(), // Can be null or omitted if no tax
    })
    .optional(),
});

export type DraftPayload = z.infer<typeof DraftSchema>;


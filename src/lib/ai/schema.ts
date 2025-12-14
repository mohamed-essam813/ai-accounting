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

export const DraftSchema = z.object({
  intent: PromptIntentEnum,
  entities: DraftEntitiesSchema,
  confidence: z.number().min(0).max(1),
});

export type DraftPayload = z.infer<typeof DraftSchema>;


/**
 * Document classifier.
 * Classify uploaded document type (invoice, bill, receipt, etc.) before parsing.
 * Used in doc-only mode to hint the accounting parser.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { env } from "@/lib/env";

const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

export const DOCUMENT_TYPES = [
  "invoice",
  "bill",
  "receipt",
  "bank_statement",
  "credit_note",
  "debit_note",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const ClassifierSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  confidence: z.number().min(0).max(1),
});

/** Classify document text. Returns type + confidence. */
export async function classifyDocument(
  documentText: string
): Promise<{ type: DocumentType; confidence: number }> {
  const text = (documentText || "").trim().slice(0, 8000);
  if (!text) {
    return { type: "other", confidence: 0 };
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: ClassifierSchema,
      prompt: `Classify this accounting document. Return exactly one type and a confidence (0–1).

Document types:
- invoice: sales invoice to customer (outgoing revenue)
- bill: vendor/supplier invoice (incoming expense)
- receipt: payment receipt, proof of payment
- bank_statement: bank statement, account summary
- credit_note: customer credit note, refund, adjustment
- debit_note: vendor debit note, correction to bill
- other: none of the above or unclear

Document text (excerpt):
---
${text}
---

Return { "type": "<one of the types above>", "confidence": <0-1> }.`,
    });

    return {
      type: object.type as DocumentType,
      confidence: object.confidence,
    };
  } catch (e) {
    console.warn("Document classifier failed, defaulting to other:", e);
    return { type: "other", confidence: 0 };
  }
}

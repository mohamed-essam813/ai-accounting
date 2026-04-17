import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/users";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const FeedbackItemSchema = z.object({
  journal_entry_id: z.string().min(1),
  line_id: z.string().min(1),
  counterparty: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  transaction_type: z.string().min(1),
  ai_suggested_account_code: z.string().min(1),
  user_chosen_account_code: z.string().min(1),
});

const RequestSchema = z.object({
  overrides: z.array(FeedbackItemSchema).min(1),
});

/**
 * POST /api/journal-feedback
 *
 * Persists account-override feedback for one or more journal lines.
 * Each record is later used to:
 *   1. Build few-shot examples for the AI prompt (see docs/ai-feedback-loop.md)
 *   2. Surface per-user account preferences in the AccountPicker "recently used" section
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json: unknown = await req.json();
    const parsed = RequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const supabase = createServiceSupabaseClient();
    const rows = parsed.data.overrides.map((o) => ({
      tenant_id: user.tenant!.id,
      journal_entry_id: o.journal_entry_id,
      line_id: o.line_id,
      counterparty: o.counterparty ?? null,
      description: o.description ?? null,
      transaction_type: o.transaction_type,
      ai_suggested_account_code: o.ai_suggested_account_code,
      user_chosen_account_code: o.user_chosen_account_code,
      user_id: user.id,
    }));

    const { error } = await (supabase.from("journal_feedback" as any) as any).insert(rows);

    if (error) {
      console.error("[POST /api/journal-feedback] insert failed", error);
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }

    return NextResponse.json({ saved: rows.length });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? "Validation failed" }, { status: 400 });
    }
    console.error("[POST /api/journal-feedback]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

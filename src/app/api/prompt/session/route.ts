import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/users";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { saveDraftAction } from "@/lib/actions/drafts";

/** Doc 6: Doc-only mode – prompt optional when documentIds provided. */
const requestSchema = z
  .object({
    prompt: z.string().optional(),
    documentIds: z.array(z.string()).optional(),
  })
  .refine(
    (d) => (d.prompt?.trim() ?? "").length > 0 || (d.documentIds?.length ?? 0) > 0,
    { message: "Provide a prompt or at least one document.", path: ["prompt"] }
  );

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const { prompt, documentIds } = requestSchema.parse(json);
    const effectivePrompt = (prompt ?? "").trim() || (documentIds?.length ? "Extract accounting entries from the following uploaded documents." : "");

    const origin = new URL(req.url).origin;
    const cookie = req.headers.get("cookie") ?? "";

    const parseRes = await fetch(`${origin}/api/prompt/parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ prompt: effectivePrompt || undefined, documentIds }),
    });

    const parseData = await parseRes.json();

    const supabase = createServiceSupabaseClient();
    const table = (supabase.from("prompt_sessions" as any) as any) as {
      insert: (values: unknown[]) => {
        select: (columns?: string) => Promise<{ data: { id: string }[] | null; error: unknown }>;
      };
    };

    if (!parseRes.ok) {
      const { data: inserted, error } = await table
        .insert([
          {
            tenant_id: user.tenant.id,
            created_by: user.id,
            original_prompt_text: (prompt ?? "").trim() || effectivePrompt,
            document_ids: documentIds ?? [],
            status: "FAILED",
            error_message: parseData.error ?? "Failed to parse prompt",
            data_json: null,
            updated_at: new Date().toISOString(),
          },
        ])
        .select("id");

      if (error) {
        console.error("Failed to create prompt session", error);
        return NextResponse.json(
          { error: parseData.error ?? "Failed to parse prompt" },
          { status: parseRes.status >= 400 ? parseRes.status : 500 }
        );
      }

      return NextResponse.json({
        session_id: inserted?.[0]?.id,
        error: parseData.error ?? "Failed to parse prompt",
      });
    }

    /** Doc 6: Clarify flow – low confidence. Create PENDING_INPUT session with needs_clarification in data_json. */
    if (parseData.needs_clarification) {
      const { data: insertedClarify, error: errClarify } = await table
        .insert([
          {
            tenant_id: user.tenant.id,
            created_by: user.id,
            original_prompt_text: (prompt ?? "").trim() || effectivePrompt,
            document_ids: documentIds ?? [],
            status: "PENDING_INPUT",
            pending_questions: [],
            resolved_fields: {},
            data_json: {
              needs_clarification: parseData.needs_clarification,
              rawPrompt: (prompt ?? "").trim(),
              documentIds: documentIds ?? [],
            },
            error_message: null,
            updated_at: new Date().toISOString(),
          },
        ])
        .select("id");
      if (errClarify) {
        console.error("Failed to create clarify session", errClarify);
        return NextResponse.json(
          { error: "Failed to create session", details: (errClarify as { message?: string }).message },
          { status: 500 }
        );
      }
      const sid = insertedClarify?.[0]?.id;
      if (!sid) {
        return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
      }
      return NextResponse.json({
        session_id: sid,
        needs_clarification: parseData.needs_clarification,
      });
    }

    const { data: inserted, error } = await table
      .insert([
        {
          tenant_id: user.tenant.id,
          created_by: user.id,
          original_prompt_text: prompt ?? "",
          document_ids: documentIds ?? [],
          detected_intent: parseData.draft?.intent ?? null,
          status: "PENDING_INPUT",
          pending_questions: [],
          resolved_fields: {},
          data_json: {
            draft: parseData.draft,
            contactId: parseData.contactId,
            rawPrompt: prompt ?? "",
            documentIds: documentIds ?? [],
            accountConfirmation: parseData.accountConfirmation ?? {},
            cashBankSelection: parseData.cashBankSelection ?? null,
          },
          error_message: null,
          updated_at: new Date().toISOString(),
        },
      ])
      .select("id");

    if (error) {
      console.error("Failed to create prompt session", error);
      return NextResponse.json(
        { error: "Failed to create session", details: (error as { message?: string }).message },
        { status: 500 }
      );
    }

    const sessionId = inserted?.[0]?.id;
    if (!sessionId) {
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    const hasQuestions =
      parseData.cashContextConfirmation?.required ||
      parseData.cashBankSelection ||
      (parseData.accountConfirmation && Object.keys(parseData.accountConfirmation).length > 0);

    if (!hasQuestions) {
      try {
        const saved = await saveDraftAction({
          ...parseData.draft,
          rawPrompt: prompt,
          contactId: parseData.contactId ?? null,
        });
        const updateTable = (supabase.from("prompt_sessions" as any) as any) as {
          update: (v: Record<string, unknown>) => {
            eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
          };
        };
        await updateTable
          .update({
            status: "DRAFT_READY",
            draft_id: saved?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionId)
          .eq("tenant_id", user.tenant.id);

        return NextResponse.json({
          session_id: sessionId,
          draft_id: saved?.id ?? null,
          draft: parseData.draft,
          contactId: parseData.contactId,
        });
      } catch (e) {
        console.error("Failed to create draft from session", e);
        const updateTable = (supabase.from("prompt_sessions" as any) as any) as {
          update: (v: Record<string, unknown>) => {
            eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
          };
        };
        await updateTable
          .update({
            status: "FAILED",
            error_message: e instanceof Error ? e.message : "Failed to create draft",
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionId)
          .eq("tenant_id", user.tenant.id);
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Failed to create draft", session_id: sessionId },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      session_id: sessionId,
      draft: parseData.draft,
      contactId: parseData.contactId,
      accountConfirmation: parseData.accountConfirmation,
      cashContextConfirmation: parseData.cashContextConfirmation,
      cashBankSelection: parseData.cashBankSelection,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: e.issues },
        { status: 400 }
      );
    }
    console.error("Prompt session create failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create session" },
      { status: 500 }
    );
  }
}

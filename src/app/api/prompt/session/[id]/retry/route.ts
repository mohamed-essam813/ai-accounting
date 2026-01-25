import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/users";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { saveDraftAction } from "@/lib/actions/drafts";

const retryBodySchema = z.object({
  clarification: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;
    let clarification: string | undefined;
    try {
      const body = await req.json().catch(() => ({}));
      const parsed = retryBodySchema.safeParse(body);
      clarification = parsed.success ? parsed.data.clarification : undefined;
    } catch {
      /* no body */
    }

    const supabase = createServiceSupabaseClient();
    const table = (supabase.from("prompt_sessions" as any) as any) as {
      select: (columns: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{
            data: {
              id: string;
              tenant_id: string;
              original_prompt_text: string;
              document_ids: unknown;
              status: string;
              data_json: unknown;
            }[] | null;
            error: unknown;
          }>;
        };
      };
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
      };
    };

    const { data: rows, error: fetchErr } = await table
      .select("id, tenant_id, original_prompt_text, document_ids, status, data_json")
      .eq("id", sessionId)
      .eq("tenant_id", user.tenant.id);

    if (fetchErr) {
      console.error("Failed to fetch prompt session", fetchErr);
      return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
    }

    const session = Array.isArray(rows) ? rows[0] : null;
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const updateTable = (supabase.from("prompt_sessions" as any) as any) as {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
      };
    };

    await updateTable
      .update({ status: "RESOLVING", error_message: null, updated_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("tenant_id", user.tenant.id);

    const origin = new URL(req.url).origin;
    const cookie = req.headers.get("cookie") ?? "";
    const documentIds = Array.isArray(session.document_ids) ? session.document_ids : [];
    /** Doc 6: Clarify – re-parse with user clarification appended. */
    const effectivePrompt =
      clarification?.trim()
        ? `${session.original_prompt_text}\n\nUser clarified: ${clarification.trim()}`
        : session.original_prompt_text;

    const parseRes = await fetch(`${origin}/api/prompt/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        prompt: effectivePrompt,
        documentIds: documentIds.length > 0 ? documentIds : undefined,
      }),
    });

    const parseData = await parseRes.json();

    if (!parseRes.ok) {
      await updateTable
        .update({
          status: "FAILED",
          error_message: parseData.error ?? "Failed to parse prompt",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("tenant_id", user.tenant.id);
      return NextResponse.json(
        { error: parseData.error ?? "Failed to parse prompt", session_id: sessionId },
        { status: parseRes.status >= 400 ? parseRes.status : 500 }
      );
    }

    /** Doc 6: Clarify – still low confidence after user clarification. Return needs_clarification again. */
    if (parseData.needs_clarification) {
      await updateTable
        .update({
          status: "PENDING_INPUT",
          data_json: {
            needs_clarification: parseData.needs_clarification,
            rawPrompt: session.original_prompt_text,
            documentIds,
          },
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("tenant_id", user.tenant.id);
      return NextResponse.json({
        session_id: sessionId,
        needs_clarification: parseData.needs_clarification,
      });
    }

    const hasQuestions =
      parseData.cashContextConfirmation?.required ||
      parseData.cashBankSelection ||
      (parseData.accountConfirmation && Object.keys(parseData.accountConfirmation).length > 0);

    if (!hasQuestions) {
      try {
        const saved = await saveDraftAction({
          ...parseData.draft,
          rawPrompt: session.original_prompt_text,
          contactId: parseData.contactId ?? null,
        });
        await updateTable
          .update({
            status: "DRAFT_READY",
            draft_id: saved?.id ?? null,
            data_json: {
              draft: parseData.draft,
              contactId: parseData.contactId,
              rawPrompt: session.original_prompt_text,
              documentIds,
              accountConfirmation: {},
              cashBankSelection: null,
            },
            error_message: null,
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
        console.error("Retry create draft failed", e);
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

    await updateTable
      .update({
        status: "PENDING_INPUT",
        data_json: {
          draft: parseData.draft,
          contactId: parseData.contactId,
          rawPrompt: session.original_prompt_text,
          documentIds,
          accountConfirmation: parseData.accountConfirmation ?? {},
          cashBankSelection: parseData.cashBankSelection ?? null,
          originalAccountConfirmations: parseData.accountConfirmation ?? {},
        },
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("tenant_id", user.tenant.id);

    return NextResponse.json({
      session_id: sessionId,
      draft: parseData.draft,
      contactId: parseData.contactId,
      accountConfirmation: parseData.accountConfirmation,
      cashContextConfirmation: parseData.cashContextConfirmation,
      cashBankSelection: parseData.cashBankSelection,
    });
  } catch (e) {
    console.error("Prompt session retry failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to retry" },
      { status: 500 }
    );
  }
}

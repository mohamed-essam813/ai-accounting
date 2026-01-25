import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/users";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { saveDraftAction } from "@/lib/actions/drafts";
import { autoCreateAccountAction } from "@/lib/actions/accounts";

async function updateSession(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  sessionId: string,
  tenantId: string,
  data: Record<string, unknown>
) {
  const t = (supabase.from("prompt_sessions" as any) as any) as {
    update: (v: Record<string, unknown>) => {
      eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
    };
  };
  return t
    .update({ data_json: data, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId);
}

const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cash_context"), isCashBank: z.boolean() }),
  z.object({
    type: z.literal("cash_bank_selection"),
    accountId: z.string().uuid(),
    accountKey: z.enum(["debit_account", "credit_account"]),
  }),
  z.object({
    type: z.literal("account_confirmation"),
    key: z.string(),
    decision: z.object({
      useExisting: z.boolean(),
      accountId: z.string().uuid().optional(),
      accountName: z.string().optional(),
      accountType: z.string().optional(),
    }),
  }),
]);

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
    const body = await req.json();
    const answer = answerSchema.parse(body.answer ?? body);

    const supabase = createServiceSupabaseClient();
    const table = (supabase.from("prompt_sessions" as any) as any) as {
      select: (columns: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{
            data: {
              id: string;
              tenant_id: string;
              data_json: Record<string, unknown>;
              status: string;
            }[] | null;
            error: unknown;
          }>;
        };
      };
      update: (values: Record<string, unknown>) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };

    const { data: rows, error: fetchErr } = await table
      .select("id, tenant_id, data_json, status")
      .eq("id", sessionId)
      .eq("tenant_id", user.tenant.id);

    if (fetchErr) {
      console.error("Failed to fetch prompt session", fetchErr);
      return NextResponse.json(
        { error: "Failed to load session" },
        { status: 500 }
      );
    }

    const session = Array.isArray(rows) ? rows[0] : null;
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const data = session.data_json as {
      draft: Record<string, unknown>;
      contactId: string | null;
      rawPrompt: string;
      documentIds: string[];
      originalAccountConfirmations: Record<string, unknown>;
      accountConfirmations: Record<string, { accountId: string | null; useExisting: boolean }>;
      cashBankSelection: unknown;
    };

    let updated = { ...data };

    if (answer.type === "cash_context") {
      if (answer.isCashBank && data.cashBankSelection) {
        await updateSession(supabase, sessionId, user.tenant.id, updated);
        return NextResponse.json({
          session_id: sessionId,
          draft: updated.draft,
          contactId: updated.contactId,
          accountConfirmation: undefined,
          cashContextConfirmation: undefined,
          cashBankSelection: data.cashBankSelection,
        });
      }
      const accountConf = updated.originalAccountConfirmations && Object.keys(updated.originalAccountConfirmations).length > 0
        ? updated.originalAccountConfirmations
        : undefined;
      if (accountConf) {
        await updateSession(supabase, sessionId, user.tenant.id, updated);
        const firstKey = Object.keys(accountConf)[0];
        return NextResponse.json({
          session_id: sessionId,
          draft: updated.draft,
          contactId: updated.contactId,
          accountConfirmation: { [firstKey]: (accountConf as Record<string, unknown>)[firstKey] },
          cashContextConfirmation: undefined,
          cashBankSelection: undefined,
        });
      }
    } else if (answer.type === "cash_bank_selection") {
      const acc = updated.draft.accounts as Record<string, unknown> | undefined;
      if (acc?.[answer.accountKey]) {
        (acc[answer.accountKey] as Record<string, unknown>).existing_account_id = answer.accountId;
      }
      updated = { ...updated, draft: { ...updated.draft, accounts: acc ?? {} } };
      const remaining = updated.originalAccountConfirmations
        ? Object.keys(updated.originalAccountConfirmations)
        : [];
      if (remaining.length > 0) {
        await updateSession(supabase, sessionId, user.tenant.id, updated);
        const firstKey = remaining[0];
        const ac = updated.originalAccountConfirmations as Record<string, unknown>;
        return NextResponse.json({
          session_id: sessionId,
          draft: updated.draft,
          contactId: updated.contactId,
          accountConfirmation: { [firstKey]: ac[firstKey] },
          cashContextConfirmation: undefined,
          cashBankSelection: undefined,
        });
      }
    } else if (answer.type === "account_confirmation") {
      const { key, decision } = answer;
      let accountId: string | null = decision.accountId ?? null;

      if (!decision.useExisting && decision.accountName && decision.accountType) {
        try {
          const created = await autoCreateAccountAction(
            decision.accountName,
            decision.accountType as "asset" | "liability" | "equity" | "revenue" | "expense",
            null
          );
          accountId = created.id;
        } catch (e) {
          console.error("Failed to create account", e);
          const failTable = (supabase.from("prompt_sessions" as any) as any) as {
            update: (v: Record<string, unknown>) => {
              eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
            };
          };
          await failTable
            .update({
              status: "FAILED",
              error_message: e instanceof Error ? e.message : "Failed to create account",
              updated_at: new Date().toISOString(),
            })
            .eq("id", sessionId)
            .eq("tenant_id", user.tenant.id);
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to create account", session_id: sessionId },
            { status: 500 }
          );
        }
      }
      const confirmations = { ...(updated.accountConfirmations || {}), [key]: { accountId, useExisting: decision.useExisting } };
      const acc = updated.draft.accounts as Record<string, unknown> | undefined;
      if (acc?.[key]) {
        (acc[key] as Record<string, unknown>).existing_account_id = accountId;
      }
      updated = {
        ...updated,
        draft: { ...updated.draft, accounts: acc ?? {} },
        accountConfirmations: confirmations,
      };

      const allKeys = Object.keys(updated.originalAccountConfirmations || {});
      const confirmedKeys = Object.keys(confirmations);
      const remaining = allKeys.filter((k) => !confirmedKeys.includes(k));

      if (remaining.length > 0) {
        await updateSession(supabase, sessionId, user.tenant.id, updated);
        const nextKey = remaining[0];
        const ac = updated.originalAccountConfirmations as Record<string, unknown>;
        return NextResponse.json({
          session_id: sessionId,
          draft: updated.draft,
          contactId: updated.contactId,
          accountConfirmation: { [nextKey]: ac[nextKey] },
          cashContextConfirmation: undefined,
          cashBankSelection: undefined,
        });
      }
    }

    const finalDraft = { ...updated.draft };
    const acc = finalDraft.accounts as Record<string, { existing_account_id?: string | null }> | undefined;
    if (acc && updated.accountConfirmations) {
      for (const [k, c] of Object.entries(updated.accountConfirmations)) {
        if (acc[k]) acc[k] = { ...acc[k], existing_account_id: c.accountId };
      }
      finalDraft.accounts = acc;
    }

    let savedDraft: { id: string } | null = null;
    try {
      savedDraft = await saveDraftAction({
        ...(finalDraft as Parameters<typeof saveDraftAction>[0]),
        rawPrompt: updated.rawPrompt,
        contactId: updated.contactId,
      });
    } catch (e) {
      console.error("Failed to create draft from session", e);
      const failTable = (supabase.from("prompt_sessions" as any) as any) as {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
        };
      };
      await failTable
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

    const okTable = (supabase.from("prompt_sessions" as any) as any) as {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
      };
    };
    await okTable
      .update({
        status: "DRAFT_READY",
        draft_id: savedDraft?.id ?? null,
        data_json: updated,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("tenant_id", user.tenant.id);

    return NextResponse.json({
      session_id: sessionId,
      draft_id: savedDraft?.id ?? null,
      draft: updated.draft,
      contactId: updated.contactId,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid answer payload", details: e.issues },
        { status: 400 }
      );
    }
    console.error("Prompt session answer failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to submit answer" },
      { status: 500 }
    );
  }
}

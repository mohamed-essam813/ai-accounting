import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/users";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;

    const supabase = createServiceSupabaseClient();
    const table = (supabase.from("prompt_sessions" as any) as any) as {
      select: (columns: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{
            data: { id: string; status: string; draft_id: string | null; error_message: string | null }[] | null;
            error: unknown;
          }>;
        };
      };
    };

    const { data: rows, error } = await table
      .select("id, status, draft_id, error_message")
      .eq("id", sessionId)
      .eq("tenant_id", user.tenant.id);

    if (error) {
      console.error("Failed to fetch prompt session", error);
      return NextResponse.json(
        { error: "Failed to fetch session" },
        { status: 500 }
      );
    }

    const session = Array.isArray(rows) ? rows[0] : null;
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      session_id: session.id,
      status: session.status,
      draft_id: session.draft_id ?? null,
      error: session.error_message ?? null,
    });
  } catch (e) {
    console.error("GET prompt session failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch session" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/users";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { postDraftAction } from "@/lib/actions/drafts";

/**
 * POST /api/bills/:id/post
 *
 * Atomically posts a bill draft:
 *  1. Validates the draft belongs to this tenant and is a supplier bill (create_bill)
 *  2. Delegates to postDraftAction which:
 *     a. Creates the journal entry
 *     b. Creates one or more fixed asset register rows (if lines include fixed assets)
 *     c. Creates any inventory purchase transactions
 *     d. Materializes the Accounts Payable bill row
 *  3. Returns the journal entry ID and bill ID
 *
 * If any step fails (including asset register creation), the entire transaction
 * is rolled back by postDraftAction via Supabase RPC.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    // Verify the draft exists, belongs to this tenant, and is a bill draft in an approvable state
    const { data: draft, error: draftError } = await supabase
      .from("drafts")
      .select("id, intent, status, tenant_id")
      .eq("id", id)
      .eq("tenant_id", user.tenant.id)
      .maybeSingle();

    if (draftError) {
      console.error("[POST /api/bills/:id/post] draft lookup error", draftError);
      return NextResponse.json({ error: "Failed to load draft" }, { status: 500 });
    }

    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (draft.intent !== "create_bill") {
      return NextResponse.json(
        { error: "This draft is not a supplier bill" },
        { status: 422 },
      );
    }

    if (draft.status === "posted") {
      return NextResponse.json(
        { error: "This bill has already been posted" },
        { status: 422 },
      );
    }

    // Delegate to the server action which handles the full atomic transaction
    const result = await postDraftAction({ draftId: id });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.message ?? "Failed to post bill", code: result.error.code },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      draftId: result.data.id,
      status: result.data.status,
      journalEntryId: result.data.posted_entry_id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to post bill";
    console.error("[POST /api/bills/:id/post]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

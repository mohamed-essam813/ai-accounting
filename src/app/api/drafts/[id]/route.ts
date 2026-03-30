import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/users";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listAccounts } from "@/lib/data/accounts";
import type { Database } from "@/lib/database.types";
import { DraftPayload } from "@/lib/ai/schema";

type DraftsRow = Database["public"]["Tables"]["drafts"]["Row"];
type AttachmentRow = Database["public"]["Tables"]["attachments"]["Row"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    // Get the draft
    const { data: draft, error: draftError } = await supabase
      .from("drafts")
      .select<"*", DraftsRow>("*")
      .eq("id", id)
      .eq("tenant_id", user.tenant.id)
      .maybeSingle();

    if (draftError || !draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    // Get documents uploaded around the same time (within 5 minutes of draft creation)
    const draftCreatedAt = new Date(draft.created_at);
    const fiveMinutesAgo = new Date(draftCreatedAt.getTime() - 5 * 60 * 1000);
    const fiveMinutesLater = new Date(draftCreatedAt.getTime() + 5 * 60 * 1000);

    const { data: documents, error: docsError } = await supabase
      .from("attachments")
      .select<"id, file_name, file_path, mime_type, created_at", Pick<AttachmentRow, "id" | "file_name" | "file_path" | "mime_type" | "created_at">>(
        "id, file_name, file_path, mime_type, created_at"
      )
      .eq("tenant_id", user.tenant.id)
      .eq("created_by", draft.created_by)
      .gte("created_at", fiveMinutesAgo.toISOString())
      .lte("created_at", fiveMinutesLater.toISOString())
      .order("created_at", { ascending: false });

    if (docsError) {
      console.error("Failed to fetch documents:", docsError);
    }

    // Get accounts for journal preview
    const accounts = await listAccounts();

    // Get inventory items for inventory picker (for invoices/bills)
    let inventoryItems: Array<{ id: string; name: string; sku: string | null; unit: string; is_active: boolean }> = [];
    if (draft.intent === "create_invoice" || draft.intent === "create_bill") {
      try {
        const { getInventoryItems } = await import("@/lib/data/inventory");
        inventoryItems = await getInventoryItems();
      } catch (error) {
        console.error("Failed to fetch inventory items:", error);
      }
    }

    return NextResponse.json({
      draft: {
        ...draft,
        confidence: draft.confidence ? Number(draft.confidence) : null,
        entities: (draft.data_json as DraftPayload["entities"]) ?? {},
      },
      documents: documents ?? [],
      accounts: accounts,
      inventoryItems: inventoryItems,
      user: {
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Failed to fetch draft:", error);
    return NextResponse.json(
      { error: "Failed to fetch draft" },
      { status: 500 }
    );
  }
}


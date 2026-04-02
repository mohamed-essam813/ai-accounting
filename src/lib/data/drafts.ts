import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import { DraftPayload } from "@/lib/ai/schema";
import type { Database } from "@/lib/database.types";

type DraftsRow = Database["public"]["Tables"]["drafts"]["Row"];

export async function getRecentDrafts(limit = 5) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  // Type assertion to fix Supabase type inference
  const table = supabase.from("drafts") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: { ascending?: boolean }) => {
          limit: (count: number) => Promise<{ data: DraftsRow[] | null; error: unknown }>;
        };
      };
    };
  };
  const { data, error } = await table
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch drafts", error);
    throw error;
  }

  const rows = data ?? [];
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))] as string[];
  let nameByContactId = new Map<string, string>();
  if (contactIds.length > 0) {
    const supabase2 = await createServerSupabaseClient();
    const { data: contacts } = await supabase2.from("contacts").select("id, name").in("id", contactIds);
    nameByContactId = new Map((contacts ?? []).map((c) => [c.id, c.name]));
  }

  return rows.map((draft) => ({
    ...draft,
    confidence: draft.confidence ? Number(draft.confidence) : null,
    entities: (draft.data_json as DraftPayload["entities"]) ?? {},
    /** Resolved from contacts — prefer this for UI over entities.counterparty */
    counterparty_display_name: draft.contact_id ? nameByContactId.get(draft.contact_id) ?? null : null,
  }));
}

export async function listDrafts(currency?: string) {
  // Currency parameter is for conversion, not filtering
  // All drafts are returned - currency conversion happens at display layer
  const drafts = await getRecentDrafts(50);
  return drafts;
}


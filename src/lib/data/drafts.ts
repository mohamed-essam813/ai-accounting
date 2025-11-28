import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import { DraftPayload } from "@/lib/ai/schema";

export async function getRecentDrafts(limit = 5) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("drafts")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch drafts", error);
    throw error;
  }

  return (data ?? []).map((draft) => ({
    ...draft,
    confidence: draft.confidence ? Number(draft.confidence) : null,
    entities: (draft.data_json as DraftPayload["entities"]) ?? {},
  }));
}

export async function listDrafts() {
  return getRecentDrafts(50);
}


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

  return (data ?? []).map((draft) => ({
    ...draft,
    confidence: draft.confidence ? Number(draft.confidence) : null,
    entities: (draft.data_json as DraftPayload["entities"]) ?? {},
  }));
}

export async function listDrafts() {
  return getRecentDrafts(50);
}


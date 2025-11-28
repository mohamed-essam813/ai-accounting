import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";

export type SourceDocument = {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  vision_text: string | null;
  created_at: string;
};

export async function listSourceDocuments(limit = 10): Promise<SourceDocument[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("source_documents")
    .select("id, file_name, file_path, mime_type, vision_text, created_at")
    .eq("tenant_id", user.tenant.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to load source documents", error);
    throw error;
  }

  return data ?? [];
}


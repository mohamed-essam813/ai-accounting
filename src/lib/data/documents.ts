import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";

export type Attachment = {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  vision_text: string | null;
  created_at: string;
};

export async function listAttachments(limit = 10): Promise<Attachment[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("attachments")
    .select("id, file_name, file_path, mime_type, vision_text, created_at")
    .eq("tenant_id", user.tenant.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to load attachments", error);
    throw error;
  }

  return data ?? [];
}

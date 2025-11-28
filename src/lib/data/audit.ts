import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";

export async function getRecentAuditEvents(limit = 10) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to load audit logs", error);
    throw error;
  }

  return (data ?? []).map((entry) => ({
    ...entry,
    changesSummary: entry.changes ? JSON.stringify(entry.changes) : null,
  }));
}


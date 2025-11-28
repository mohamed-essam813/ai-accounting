import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

type AuditLogsRow = Database["public"]["Tables"]["audit_logs"]["Row"];

export async function getRecentAuditEvents(limit = 10) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  // Type assertion to fix Supabase type inference
  const table = supabase.from("audit_logs") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: { ascending?: boolean }) => {
          limit: (count: number) => Promise<{ data: AuditLogsRow[] | null; error: unknown }>;
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
    console.error("Failed to load audit logs", error);
    throw error;
  }

  return (data ?? []).map((entry) => ({
    ...entry,
    changesSummary: entry.changes ? JSON.stringify(entry.changes) : null,
  }));
}


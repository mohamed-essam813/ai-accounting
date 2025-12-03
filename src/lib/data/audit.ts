import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { Database } from "@/lib/database.types";

type AuditLogsRow = Database["public"]["Tables"]["audit_logs"]["Row"];
type AppUsersRow = Database["public"]["Tables"]["app_users"]["Row"];

export type AuditEvent = AuditLogsRow & {
  actor_name?: string | null;
  actor_email?: string | null;
  document_number?: string | null;
  changesSummary?: string | null;
};

export async function getRecentAuditEvents(limit = 100, searchQuery?: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  
  // Type assertion to fix Supabase type inference
  const table = supabase.from("audit_logs") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        or?: (filter: string) => {
          order: (column: string, options?: { ascending?: boolean }) => {
            limit: (count: number) => Promise<{ data: AuditLogsRow[] | null; error: unknown }>;
          };
        };
        order: (column: string, options?: { ascending?: boolean }) => {
          limit: (count: number) => Promise<{ data: AuditLogsRow[] | null; error: unknown }>;
        };
      };
    };
  };
  
  let query = table.select("*").eq("tenant_id", user.tenant.id);
  
  // Add search filter if provided
  if (searchQuery) {
    const searchFilter = `action.ilike.%${searchQuery}%,entity.ilike.%${searchQuery}%,entity_id.ilike.%${searchQuery}%`;
    query = query.or?.(searchFilter) ?? query;
  }
  
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to load audit logs", error);
    throw error;
  }

  // Fetch user details for actor_ids and extract document numbers
  const actorIds = new Set<string>();
  const draftIds = new Set<string>();
  
  (data ?? []).forEach((entry) => {
    if (entry.actor_id) actorIds.add(entry.actor_id);
    if (entry.entity === "drafts" && entry.entity_id) draftIds.add(entry.entity_id);
  });

  // Get user details
  const userIds = Array.from(actorIds);
  let usersMap = new Map<string, { email: string; name?: string }>();
  if (userIds.length > 0) {
    type AppUsersRow = Database["public"]["Tables"]["app_users"]["Row"];
    const usersTable = supabase.from("app_users") as unknown as {
      select: (columns: string) => {
        in: (column: string, values: string[]) => Promise<{ data: Pick<AppUsersRow, "id" | "email">[] | null; error: unknown }>;
      };
    };
    const { data: users } = await usersTable.select("id, email").in("id", userIds);
    users?.forEach((u) => {
      usersMap.set(u.id, { email: u.email });
    });
  }

  // Get draft document numbers (invoice/bill numbers)
  const draftIdsArray = Array.from(draftIds);
  let documentNumbersMap = new Map<string, string>();
  if (draftIdsArray.length > 0) {
    type DraftsRow = Database["public"]["Tables"]["drafts"]["Row"];
    const draftsTable = supabase.from("drafts") as unknown as {
      select: (columns: string) => {
        in: (column: string, values: string[]) => Promise<{ data: Pick<DraftsRow, "id" | "data_json" | "intent">[] | null; error: unknown }>;
      };
    };
    const { data: drafts } = await draftsTable.select("id, data_json, intent").in("id", draftIdsArray);
    drafts?.forEach((draft) => {
      const data = draft.data_json as { invoice_number?: string | null };
      if (data?.invoice_number) {
        documentNumbersMap.set(draft.id, data.invoice_number);
      } else if (draft.intent === "create_bill") {
        // Extract bill number if available
        const billData = draft.data_json as { bill_number?: string | null; invoice_number?: string | null };
        if (billData?.bill_number || billData?.invoice_number) {
          documentNumbersMap.set(draft.id, billData.bill_number || billData.invoice_number || "");
        }
      }
    });
  }

  return (data ?? []).map((entry) => {
    const actor = entry.actor_id ? usersMap.get(entry.actor_id) : null;
    const documentNumber = entry.entity === "drafts" && entry.entity_id 
      ? documentNumbersMap.get(entry.entity_id) 
      : null;
    
    return {
      ...entry,
      actor_name: actor?.email ?? null,
      actor_email: actor?.email ?? null,
      document_number: documentNumber ?? null,
      changesSummary: entry.changes ? JSON.stringify(entry.changes) : null,
    } as AuditEvent;
  });
}


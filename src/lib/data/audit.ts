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

type SearchParams = {
  search?: string;
  invoiceNumber?: string;
  billNumber?: string;
  contact?: string;
  amount?: string;
  date?: string;
  action?: string;
};

export async function getRecentAuditEvents(limit = 100, searchParams?: SearchParams | string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  
  // Handle legacy string search for backward compatibility
  const params: SearchParams = typeof searchParams === "string" 
    ? { search: searchParams }
    : searchParams ?? {};

  // For draft-related filters (invoice number, bill number, contact, amount),
  // we need to first find matching drafts, then filter audit logs by those draft IDs
  // Since Supabase doesn't support complex JSONB queries easily, we fetch and filter in memory
  let draftFilterIds: string[] | null = null;
  
  if (params.invoiceNumber || params.billNumber || params.contact || params.amount) {
    // Fetch all drafts for the tenant (we'll filter in memory)
    type DraftsRow = Database["public"]["Tables"]["drafts"]["Row"];
    const draftsTable = supabase.from("drafts") as unknown as {
      select: (columns: string) => {
        eq: (column: string, value: string) => Promise<{ data: Pick<DraftsRow, "id" | "data_json">[] | null; error: unknown }>;
      };
    };
    
    const { data: allDrafts, error: draftError } = await draftsTable
      .select("id, data_json")
      .eq("tenant_id", user.tenant.id);
    
    if (draftError) {
      console.error("Failed to query drafts for filtering:", draftError);
      return [];
    }
    
    if (allDrafts && allDrafts.length > 0) {
      // Filter drafts in memory based on search criteria
      const filtered = allDrafts.filter((draft) => {
        const data = draft.data_json as {
          invoice_number?: string | null;
          bill_number?: string | null;
          counterparty?: string | null;
          amount?: number | null;
        };
        
        if (params.invoiceNumber) {
          const invoiceLower = params.invoiceNumber.toLowerCase();
          if (!data.invoice_number?.toLowerCase().includes(invoiceLower)) return false;
        }
        
        if (params.billNumber) {
          const billLower = params.billNumber.toLowerCase();
          if (!data.bill_number?.toLowerCase().includes(billLower) &&
              !data.invoice_number?.toLowerCase().includes(billLower)) return false;
        }
        
        if (params.contact) {
          const contactLower = params.contact.toLowerCase();
          if (!data.counterparty?.toLowerCase().includes(contactLower)) return false;
        }
        
        if (params.amount) {
          const amountValue = parseFloat(params.amount);
          if (!isNaN(amountValue)) {
            if (data.amount === null || data.amount === undefined) return false;
            if (Math.abs((data.amount ?? 0) - amountValue) >= 0.01) return false;
          }
        }
        
        return true;
      });
      
      if (filtered.length > 0) {
        draftFilterIds = filtered.map((d) => d.id);
      } else {
        // No matching drafts found, return empty result
        return [];
      }
    } else {
      // No drafts at all, return empty result if we're filtering by draft fields
      return [];
    }
  }

  // Build audit logs query with backend filtering
  let auditQuery = supabase
    .from("audit_logs")
    .select("*")
    .eq("tenant_id", user.tenant.id);

  // Filter by action (direct SQL filter)
  if (params.action) {
    auditQuery = auditQuery.eq("action", params.action);
  }

  // Filter by date (direct SQL filter)
  if (params.date) {
    const searchDate = new Date(params.date).toISOString().split("T")[0];
    const startDate = `${searchDate}T00:00:00.000Z`;
    const endDate = `${searchDate}T23:59:59.999Z`;
    auditQuery = auditQuery.gte("created_at", startDate).lte("created_at", endDate);
  }

  // Filter by general search (action or entity) - backend SQL ILIKE
  if (params.search) {
    const searchLower = params.search.toLowerCase();
    auditQuery = auditQuery.or(`action.ilike.%${searchLower}%,entity.ilike.%${searchLower}%`);
  }

  // Filter by draft IDs if we have them (for invoice/bill/contact/amount filters)
  if (draftFilterIds && draftFilterIds.length > 0) {
    auditQuery = auditQuery.eq("entity", "drafts").in("entity_id", draftFilterIds);
  } else if (draftFilterIds && draftFilterIds.length === 0) {
    // No matching drafts, return empty result
    return [];
  }

  // Execute query with ordering and limit
  const { data: allData, error } = await auditQuery
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to load audit logs", error);
    throw error;
  }

  if (!allData || allData.length === 0) {
    return [];
  }

  const data = allData;

  // Get drafts data for document numbers (only for the filtered results)
  const draftIds = new Set<string>();
  data.forEach((entry) => {
    if (entry.entity === "drafts" && entry.entity_id) {
      draftIds.add(entry.entity_id);
    }
  });

  let draftsMap = new Map<string, { invoice_number?: string | null; bill_number?: string | null; counterparty?: string | null; amount?: number | null }>();
  if (draftIds.size > 0) {
    type DraftsRow = Database["public"]["Tables"]["drafts"]["Row"];
    const draftsTable = supabase.from("drafts") as unknown as {
      select: (columns: string) => {
        in: (column: string, values: string[]) => Promise<{ data: Pick<DraftsRow, "id" | "data_json">[] | null; error: unknown }>;
      };
    };
    const { data: drafts } = await draftsTable.select("id, data_json").in("id", Array.from(draftIds));
    drafts?.forEach((draft) => {
      const data = draft.data_json as {
        invoice_number?: string | null;
        bill_number?: string | null;
        counterparty?: string | null;
        amount?: number | null;
      };
      draftsMap.set(draft.id, {
        invoice_number: data.invoice_number,
        bill_number: data.bill_number,
        counterparty: data.counterparty,
        amount: typeof data.amount === "number" ? data.amount : null,
      });
    });
  }

  // Fetch user details for actor_ids
  const actorIds = new Set<string>();
  data.forEach((entry) => {
    if (entry.actor_id) actorIds.add(entry.actor_id);
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

  return data.map((entry) => {
    const actor = entry.actor_id ? usersMap.get(entry.actor_id) : null;
    const documentNumber = entry.entity === "drafts" && entry.entity_id 
      ? draftsMap.get(entry.entity_id)?.invoice_number ?? draftsMap.get(entry.entity_id)?.bill_number ?? null
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

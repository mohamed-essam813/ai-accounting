import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

type AuditInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

export type AppendAuditInput = {
  tenantId: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  changes?: Json | Record<string, unknown> | null;
  resourceType?: string | null;
  resourceLabel?: string | null;
  metadata?: Json | Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Append-only audit trail. Call from server actions after successful mutations.
 */
export async function appendAuditLog(
  supabase: SupabaseClient<Database>,
  input: AppendAuditInput,
): Promise<void> {
  const row: AuditInsert = {
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId ?? null,
    changes: (input.changes ?? null) as Json | null,
    resource_type: input.resourceType ?? input.entity,
    resource_label: input.resourceLabel ?? null,
    metadata: (input.metadata ?? null) as Json | null,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
  };

  const { error } = await supabase.from("audit_logs").insert([row]);
  if (error) {
    console.error("[appendAuditLog]", error);
    throw error;
  }
}

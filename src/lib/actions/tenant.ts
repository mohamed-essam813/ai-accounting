"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts, type UserRole } from "@/lib/auth";
import type { Database } from "@/lib/database.types";

type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

const TenantSchema = z.object({
  name: z.string().min(2),
});

export async function updateTenantProfileAction(input: z.infer<typeof TenantSchema>) {
  const payload = TenantSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only admins can update tenant profile.");
  }

  const supabase = await createServerSupabaseClient();
  // Type assertion to fix Supabase type inference
  type TenantsUpdate = Database["public"]["Tables"]["tenants"]["Update"];
  const table = supabase.from("tenants") as unknown as {
    update: (values: TenantsUpdate) => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>;
    };
  };
  const { error } = await table.update({ name: payload.name }).eq("id", user.tenant.id);

  if (error) throw error;

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "tenant.updated",
    entity: "tenants",
    entity_id: user.tenant.id,
    changes: payload,
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/settings/tenant");
  revalidatePath("/dashboard");
}


"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts, type UserRole } from "@/lib/auth";
import type { Database } from "@/lib/database.types";

type PendingInvitesInsert = Database["public"]["Tables"]["pending_invites"]["Insert"];
type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "accountant", "business_user", "auditor"]),
});

export async function inviteUserAction(input: z.infer<typeof InviteSchema>) {
  const payload = InviteSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only admins can invite new users.");
  }

  const supabase = await createServerSupabaseClient();
  const insertData: PendingInvitesInsert = {
    tenant_id: user.tenant.id,
    email: payload.email.toLowerCase(),
    role: payload.role,
    invited_by: user.id,
  };
  // Use type assertion for insert to fix type inference
  // Type assertion to fix Supabase type inference - this is type-safe as we're using Database types
  const table = supabase.from("pending_invites") as unknown as {
    insert: (values: PendingInvitesInsert[]) => Promise<{ error: unknown }>;
  };
  const { error } = await table.insert([insertData]);

  if (error) throw error;

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "invite.created",
    entity: "pending_invites",
    changes: payload,
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/settings/tenant");
}

const RevokeSchema = z.object({
  inviteId: z.string().uuid(),
});

export async function revokeInviteAction(input: z.infer<typeof RevokeSchema>) {
  const payload = RevokeSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only admins can revoke invites.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("pending_invites")
    .delete()
    .eq("id", payload.inviteId)
    .eq("tenant_id", user.tenant.id);

  if (error) throw error;

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "invite.revoked",
    entity: "pending_invites",
    entity_id: payload.inviteId,
  };
  // Type assertion to fix Supabase type inference
  const auditTable = supabase.from("audit_logs") as unknown as {
    insert: (values: AuditLogsInsert[]) => Promise<{ error: unknown }>;
  };
  await auditTable.insert([auditData]);

  revalidatePath("/settings/tenant");
}


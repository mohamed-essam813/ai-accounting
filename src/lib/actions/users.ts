"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts } from "@/lib/auth";

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

  if (!canManageAccounts(user.role)) {
    throw new Error("Only admins can invite new users.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("pending_invites").insert({
    tenant_id: user.tenant.id,
    email: payload.email.toLowerCase(),
    role: payload.role,
    invited_by: user.id,
  });

  if (error) throw error;

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "invite.created",
    entity: "pending_invites",
    changes: payload,
  });

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

  if (!canManageAccounts(user.role)) {
    throw new Error("Only admins can revoke invites.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("pending_invites")
    .delete()
    .eq("id", payload.inviteId)
    .eq("tenant_id", user.tenant.id);

  if (error) throw error;

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "invite.revoked",
    entity: "pending_invites",
    entity_id: payload.inviteId,
  });

  revalidatePath("/settings/tenant");
}


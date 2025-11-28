"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { canManageAccounts } from "@/lib/auth";

const TenantSchema = z.object({
  name: z.string().min(2),
});

export async function updateTenantProfileAction(input: z.infer<typeof TenantSchema>) {
  const payload = TenantSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  if (!canManageAccounts(user.role)) {
    throw new Error("Only admins can update tenant profile.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("tenants")
    .update({ name: payload.name })
    .eq("id", user.tenant.id);

  if (error) throw error;

  await supabase.from("audit_logs").insert({
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "tenant.updated",
    entity: "tenants",
    entity_id: user.tenant.id,
    changes: payload,
  });

  revalidatePath("/settings/tenant");
  revalidatePath("/dashboard");
}


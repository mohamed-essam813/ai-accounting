import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export const getCurrentUser = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return null;
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load current user", error);
    throw error;
  }

  if (!data) {
    return null;
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", data.tenant_id)
    .maybeSingle();

  return {
    ...data,
    tenant,
  } as Database["public"]["Tables"]["app_users"]["Row"] & {
    tenant: Database["public"]["Tables"]["tenants"]["Row"] | null;
  };
});


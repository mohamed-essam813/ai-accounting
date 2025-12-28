import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export const getCurrentUser = cache(async () => {
  const supabase = await createServerSupabaseClient();
  
  // Try to get session, but handle errors gracefully (e.g., invalid refresh token)
  let session;
  try {
    const sessionResult = await supabase.auth.getSession();
    session = sessionResult.data?.session;
  } catch (error) {
    // If there's an auth error (like invalid refresh token), just return null
    // This happens when user is not logged in or has stale tokens
    console.warn("Auth session check failed (user likely not logged in):", error);
    return null;
  }

  if (!session?.user) {
    return null;
  }

  // Type assertion to fix Supabase type inference
  type AppUsersRow = Database["public"]["Tables"]["app_users"]["Row"];
  const appUsersTable = supabase.from("app_users") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: AppUsersRow | null; error: unknown }>;
      };
    };
  };
  const { data, error } = await appUsersTable
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

  // Type assertion to fix Supabase type inference
  type TenantsRow = Database["public"]["Tables"]["tenants"]["Row"];
  const tenantsTable = supabase.from("tenants") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: TenantsRow | null; error: unknown }>;
      };
    };
  };
  const { data: tenant } = await tenantsTable
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


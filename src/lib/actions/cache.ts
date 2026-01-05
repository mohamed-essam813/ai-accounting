"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import type { Database } from "@/lib/database.types";

type PromptCacheRow = Database["public"]["Tables"]["ai_prompt_cache"]["Row"];

/**
 * Clear all prompt cache entries for the current tenant
 */
export async function clearPromptCacheAction() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();
  
  // Delete all cache entries for this tenant
  const table = supabase.from("ai_prompt_cache") as unknown as {
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: unknown; count?: number }>;
    };
  };
  
  const { error, count } = await table.delete().eq("tenant_id", user.tenant.id);

  if (error) {
    console.error("Failed to clear prompt cache:", error);
    throw new Error("Failed to clear prompt cache");
  }

  return { success: true, deletedCount: count ?? 0 };
}

/**
 * Clear prompt cache for a specific prompt (by prompt text)
 */
export async function clearPromptCacheForTextAction(promptText: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const { createHash } = await import("crypto");
  const promptHash = createHash("sha256").update(promptText.trim()).digest("hex");

  const supabase = await createServerSupabaseClient();
  
  const table = supabase.from("ai_prompt_cache") as unknown as {
    delete: () => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ error: unknown; count?: number }>;
      };
    };
  };
  
  const { error, count } = await table
    .delete()
    .eq("tenant_id", user.tenant.id)
    .eq("prompt_hash", promptHash);

  if (error) {
    console.error("Failed to clear prompt cache for text:", error);
    throw new Error("Failed to clear prompt cache");
  }

  return { success: true, deletedCount: count ?? 0 };
}


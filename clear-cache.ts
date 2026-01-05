/**
 * Quick script to clear prompt cache
 * Run with: npx tsx clear-cache.ts
 */

import { createServerSupabaseClient } from "./src/lib/supabase/server";
import { getCurrentUser } from "./src/lib/data/users";

async function clearCache() {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      console.error("User tenant not resolved.");
      process.exit(1);
    }

    const supabase = await createServerSupabaseClient();
    
    const { data, error, count } = await supabase
      .from("ai_prompt_cache")
      .delete()
      .eq("tenant_id", user.tenant.id)
      .select();

    if (error) {
      console.error("Failed to clear cache:", error);
      process.exit(1);
    }

    console.log(`✅ Successfully cleared prompt cache for tenant: ${user.tenant.id}`);
    console.log(`   Deleted ${count ?? 0} cache entries`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

clearCache();


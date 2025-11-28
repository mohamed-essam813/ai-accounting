import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { clientEnv } from "../env";

export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}


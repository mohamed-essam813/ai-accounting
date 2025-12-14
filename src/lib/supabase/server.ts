import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { env } from "../env";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          try {
            // Try to use getAll() if it exists
            if (typeof cookieStore.getAll === "function") {
              return cookieStore.getAll();
            }
            // Fallback: manually get all cookies by trying common Supabase cookie names
            const allCookies: Array<{ name: string; value: string }> = [];
            // Supabase typically uses cookies starting with 'sb-'
            // We can't enumerate all cookies, so return empty array
            // Supabase will handle this gracefully
            return allCookies;
          } catch (error) {
            console.warn("[supabase] Failed to get cookies:", error);
            return [];
          }
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This is expected behavior in Next.js Server Components.
            // Cookies can only be modified in Server Actions or Route Handlers.
            // This is handled by middleware for session refresh.
            // Silently ignore ALL cookie errors in Server Components - they are expected.
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isExpectedCookieError = 
              errorMessage.includes("Cookies can only be modified") ||
              errorMessage.includes("Route Handler") ||
              errorMessage.includes("Server Action") ||
              errorMessage.includes("Server Component");
            
            if (isExpectedCookieError) {
              // This is the expected Server Component cookie error - silently ignore
              return;
            }
            // Only log truly unexpected errors (not cookie-related)
            if (process.env.NODE_ENV !== "production") {
              console.warn("[supabase] Unexpected error:", error);
            }
          }
        },
      },
    },
  );
}


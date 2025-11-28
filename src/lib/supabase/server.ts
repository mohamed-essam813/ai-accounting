import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { env } from "../env";

export async function createServerSupabaseClient() {
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
            // This can be ignored if you have middleware refreshing
            // user sessions.
            if (process.env.NODE_ENV !== "production") {
              console.warn("[supabase] Failed to set cookies (this is normal in Server Components):", error);
            }
          }
        },
      },
    },
  );
}


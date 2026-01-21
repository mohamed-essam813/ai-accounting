import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  
  // Try to get session, but handle errors gracefully
  let session = null;
  try {
    const sessionResult = await supabase.auth.getSession();
    session = sessionResult.data?.session;
  } catch {
    // User is not logged in or has invalid tokens - redirect to auth
    redirect("/auth");
  }

  if (!session) {
    redirect("/auth");
  }

  redirect("/dashboard");
}

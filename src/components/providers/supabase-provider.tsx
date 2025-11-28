"use client";

import { createContext, useContext, useMemo } from "react";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type SupabaseProviderProps = {
  initialSession: Session | null;
  children: React.ReactNode;
};

const SupabaseContext = createContext<ReturnType<typeof createBrowserSupabaseClient> | null>(null);

export function SupabaseProvider({ initialSession, children }: SupabaseProviderProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  return (
    <SessionContextProvider supabaseClient={supabase} initialSession={initialSession}>
      <SupabaseContext.Provider value={supabase}>{children}</SupabaseContext.Provider>
    </SessionContextProvider>
  );
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error("useSupabase must be used within SupabaseProvider");
  }
  return ctx;
}


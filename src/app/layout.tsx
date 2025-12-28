import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { SupabaseProvider } from "@/components/providers/supabase-provider";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Accounting Platform",
  description: "Prompt-driven accounting workflow with human review and compliance.",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  
  // Try to get session, but handle errors gracefully
  // This prevents "Invalid Refresh Token" errors when user is not logged in
  let session = null;
  try {
    const sessionResult = await supabase.auth.getSession();
    session = sessionResult.data?.session;
  } catch (error) {
    // Silently handle auth errors - user is simply not logged in
    // This is expected behavior when accessing the app without authentication
    if (process.env.NODE_ENV === "development") {
      console.debug("No valid session found (user not logged in)");
    }
  }

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SupabaseProvider initialSession={session}>
          {children}
          <Toaster richColors position="top-center" />
        </SupabaseProvider>
      </body>
    </html>
  );
}

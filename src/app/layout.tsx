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
  const {
    data: { session },
  } = await supabase.auth.getSession();

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

import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SidebarProvider } from "@/contexts/sidebar-context";
import { getCurrentUser } from "@/lib/data/users";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { QueryProvider } from "@/components/providers/query-provider";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // This layout only renders for authenticated routes
  // getCurrentUser now handles auth errors gracefully and returns null if not logged in
  const user = await getCurrentUser();

  if (!user) {
    // User is not logged in or not in app_users table
    // Redirect to auth
    redirect("/auth");
  }

  return (
    <QueryProvider>
      <SidebarProvider defaultState="expanded">
        <div className="flex min-h-screen bg-background">
          <ProgressBar />
          <SidebarLayout tenant={user?.tenant ?? null} user={user}>
            {children}
          </SidebarLayout>
        </div>
      </SidebarProvider>
    </QueryProvider>
  );
}


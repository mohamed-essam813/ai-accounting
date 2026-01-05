import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getCurrentUser } from "@/lib/data/users";
import { ProgressBar } from "@/components/ui/progress-bar";

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
    <div className="flex min-h-screen bg-background">
      <ProgressBar />
      <Sidebar tenant={user?.tenant ?? null} />
      <div className="flex min-h-screen flex-1 flex-col ml-64">
        <Topbar user={user} />
        <main className="flex-1 overflow-y-auto overflow-x-auto bg-muted/10 p-6 pt-20">{children}</main>
      </div>
    </div>
  );
}


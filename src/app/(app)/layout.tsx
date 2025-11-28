import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getCurrentUser } from "@/lib/data/users";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    console.error("Failed to get current user in layout:", error);
    redirect("/auth");
  }

  if (!user) {
    // User is authenticated but not in app_users table
    // Redirect to auth with a message
    redirect("/auth?error=not_linked");
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar tenant={user?.tenant ?? null} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar user={user} />
        <main className="flex-1 overflow-y-auto bg-muted/10 p-6">{children}</main>
      </div>
    </div>
  );
}


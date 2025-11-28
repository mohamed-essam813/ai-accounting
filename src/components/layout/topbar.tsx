"use client";

import { LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { roleLabels, type UserRole } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

type AppUser = Database["public"]["Tables"]["app_users"]["Row"];

type TopbarProps = {
  user: (AppUser & { tenant: Database["public"]["Tables"]["tenants"]["Row"] | null }) | null;
};

export function Topbar({ user }: TopbarProps) {
  const initials = user?.email
    ? user.email
        .split("@")[0]
        .split(/[.\-_]/)
        .map((part) => part.charAt(0).toUpperCase())
        .join("")
        .slice(0, 2)
    : "U";

  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSignOut = () => {
    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error("Failed to sign out", { description: error.message });
      } else {
        toast.success("Signed out");
        router.push("/auth");
        router.refresh();
      }
    });
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">AI Accounting Platform</p>
        <h1 className="text-lg font-semibold">{user?.tenant?.name ?? "Tenant Workspace"}</h1>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-3 px-2">
            <div className="text-right">
              <p className="text-sm font-medium">{user?.email ?? "Anonymous"}</p>
              <p className="text-xs text-muted-foreground">
                {user ? roleLabels[user.role as UserRole] : "Guest"}
              </p>
            </div>
            <Avatar className="h-9 w-9">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="max-w-full">
            <p className="text-sm font-semibold break-words">{user?.email ?? "Anonymous"}</p>
            <p className="text-xs text-muted-foreground">
               {user ? roleLabels[user.role as UserRole] : "Guest"}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push("/settings/tenant")}>
            <Settings className="mr-2 h-4 w-4" />
            Account settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              handleSignOut();
            }}
            disabled={isPending}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}


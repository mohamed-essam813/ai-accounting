"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { mainNavigation } from "@/config/navigation";
import { TenantSwitcher } from "@/components/tenant-switcher";
import type { Database } from "@/lib/database.types";

type Tenant = Database["public"]["Tables"]["tenants"]["Row"];

type SidebarProps = {
  tenant: Tenant | null;
};

export function Sidebar({ tenant }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-72 flex-col border-r bg-muted/20">
      <div className="p-4">
        <TenantSwitcher tenantName={tenant?.name ?? "Unassigned Tenant"} />
      </div>
      <nav className="flex-1 space-y-1 px-2 pb-6">
        {mainNavigation.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <Icon className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}


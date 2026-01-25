"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { mainNavigation } from "@/config/navigation";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { useSidebar } from "@/contexts/sidebar-context";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import type { Database } from "@/lib/database.types";

type Tenant = Database["public"]["Tables"]["tenants"]["Row"];

type SidebarProps = {
  tenant: Tenant | null;
};

export function Sidebar({ tenant }: SidebarProps) {
  const pathname = usePathname();
  const { state, toggle, isExpanded, isCollapsed, isHidden } = useSidebar();
  const [isHovered, setIsHovered] = useState(false);

  // Use state from context for width calculation
  // The context's actualState handles SSR/client matching
  // state here IS actualState from context, so it should work correctly
  const showExpandedContent = isExpanded || (isCollapsed && isHovered);

  return (
    <>
      {/* Mobile: Off-canvas sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-shrink-0 flex-col border-r border-border bg-background transition-all duration-300 md:hidden",
          isHidden ? "-translate-x-full" : "translate-x-0"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4 bg-background">
          <TenantSwitcher tenantName={tenant?.name ?? "Unassigned Tenant"} />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="h-8 w-8"
            aria-label="Close sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {mainNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                    : "text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                <span className="truncate">{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Desktop: Collapsible sidebar */}
      {!isHidden && (
        <aside
          className={cn(
            "fixed left-0 top-0 z-40 hidden md:flex h-screen flex-shrink-0 flex-col border-r border-border bg-background transition-all duration-300",
            // Use state directly for width - ensure it matches SidebarLayout calculation
            state === "expanded" ? "w-64" : state === "collapsed" ? "w-16" : "w-0"
          )}
          // CRITICAL FIX: Always include event handlers to prevent hydration mismatch
          // React requires handlers to be consistently present or absent
          // We always include them but check state inside
          onMouseEnter={() => {
            if (isCollapsed) {
              setIsHovered(true);
            }
          }}
          onMouseLeave={() => {
            if (isCollapsed) {
              setIsHovered(false);
            }
          }}
        >
          {/* Header with toggle */}
          <div className="flex h-16 items-center justify-between border-b border-border bg-background">
            {showExpandedContent ? (
              <div className="flex items-center justify-between w-full gap-2 px-4">
                <div className="flex-1 min-w-0">
                  <TenantSwitcher tenantName={tenant?.name ?? "Unassigned Tenant"} />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggle}
                  className="h-8 w-8 shrink-0"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="w-full flex justify-center px-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggle}
                  className="h-8 w-8"
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4">
            <TooltipProvider delayDuration={0}>
              {mainNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                
                const linkContent = (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                        : "text-foreground hover:bg-muted/50",
                      !showExpandedContent && "justify-center"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                    {showExpandedContent && <span className="truncate">{item.title}</span>}
                  </Link>
                );

                if (isCollapsed && !isHovered) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        {linkContent}
                      </TooltipTrigger>
                      <TooltipContent side="right" className="ml-2">
                        {item.title}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return linkContent;
              })}
            </TooltipProvider>
          </nav>
        </aside>
      )}

      {/* Floating drawer for collapsed mode hover - only on desktop */}
      {!isHidden && isCollapsed && isHovered && (
        <aside 
          className="fixed left-16 top-0 z-50 hidden md:flex h-screen w-64 flex-shrink-0 flex-col border-r border-border bg-background shadow-lg"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="flex h-16 items-center border-b border-border px-4 bg-background">
            <TenantSwitcher tenantName={tenant?.name ?? "Unassigned Tenant"} />
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4">
            {mainNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                      : "text-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
      )}
    </>
  );
}


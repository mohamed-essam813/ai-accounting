"use client";

import { ReactNode, useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useSidebar } from "@/contexts/sidebar-context";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/database.types";

type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
type AppUser = Database["public"]["Tables"]["app_users"]["Row"];

type SidebarLayoutProps = {
  tenant: Tenant | null;
  user: (AppUser & { tenant: Tenant | null }) | null;
  children: ReactNode;
};

export function SidebarLayout({ tenant, user, children }: SidebarLayoutProps) {
  const { state, isExpanded, isCollapsed, isHidden, setState } = useSidebar();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [hasInitializedDashboard, setHasInitializedDashboard] = useState(false);
  // Track the actual sidebar state to prevent design shifts
  const [actualSidebarState, setActualSidebarState] = useState<"expanded" | "collapsed" | "hidden">(state);

  // Load stored preference on mount. Only auto-collapse on dashboard when user has NO preference.
  useEffect(() => {
    if (typeof window === "undefined" || hasInitializedDashboard) return;
    
    const stored = localStorage.getItem("sidebar-state") as "expanded" | "collapsed" | "hidden" | null;
    const isValid = stored && ["expanded", "collapsed", "hidden"].includes(stored);

    if (pathname === "/dashboard" && window.innerWidth >= 768) {
      // Auto-collapse only when there is NO stored preference (first visit).
      // If user has explicitly expanded/collapsed/hidden, always respect it.
      if (!isValid) {
        localStorage.setItem("sidebar-state", "collapsed");
        setState("collapsed");
        setActualSidebarState("collapsed");
      } else {
        setActualSidebarState(stored);
      }
    } else {
      setActualSidebarState(isValid ? stored! : state);
    }
    
    setHasInitializedDashboard(true);
  }, [pathname, setState, hasInitializedDashboard, state]);
  
  // Sync actualSidebarState with context state changes
  // This ensures when user clicks toggle, the sidebar width updates immediately
  useEffect(() => {
    // Use the actual state from context (which respects isMounted)
    // If mounted, use state; otherwise keep current actualSidebarState to prevent shifts
    if (typeof window !== "undefined") {
      setActualSidebarState(state);
    }
  }, [state]);

  // Initialize mobile state and mark as mounted
  useEffect(() => {
    setIsMounted(true);
    const checkMobile = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      // On mobile, default to hidden if not set
      if (width < 768) {
        const stored = localStorage.getItem("sidebar-state");
        if (!stored) {
          setState("hidden");
        }
      }
    };
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [setState]);

  // Calculate sidebar width based on state (desktop only)
  // CRITICAL: Use actualSidebarState to prevent design shifts when DashboardWrapper mounts
  // This ensures consistent width calculation regardless of context re-renders
  const sidebarWidth = (() => {
    // SSR: always return expanded width to match server
    if (typeof window === "undefined") {
      return 256;
    }
    // Client: use actualSidebarState which is synced with state but doesn't reset on re-renders
    if (isMobile) {
      return 0; // Mobile: sidebar is off-canvas
    }
    // Desktop: use actualSidebarState - ensures consistent design
    return actualSidebarState === "expanded" ? 256 : actualSidebarState === "collapsed" ? 64 : 0;
  })();

  const isLedgerPage = pathname === "/ledger";

  return (
    <>
      <Sidebar tenant={tenant} />
      <div
        className={cn(
          "flex flex-1 flex-col transition-all duration-300",
          isLedgerPage ? "h-screen min-h-0" : "min-h-screen",
        )}
        style={{ marginLeft: `${sidebarWidth}px` }}
      >
        {/* Mobile hamburger menu */}
        {isMobile && (
          <div className="fixed top-4 left-4 z-50">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setState(isHidden ? "expanded" : "hidden")}
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        )}
        <Topbar user={user} sidebarWidth={sidebarWidth} />
        <main
          className={cn(
            "flex-1 bg-muted/10 p-6 pt-20",
            isLedgerPage
              ? "flex min-h-0 flex-col overflow-hidden"
              : "overflow-y-auto overflow-x-hidden",
          )}
        >
          {children}
        </main>
      </div>
    </>
  );
}

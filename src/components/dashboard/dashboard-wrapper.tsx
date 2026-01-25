"use client";

import React from "react";
import { useSidebar } from "@/contexts/sidebar-context";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardWrapper({ children }: { children: React.ReactNode }) {
  // Hooks must be called unconditionally
  // The context is provided in the layout, so it should always be available
  const { toggleFocus, isHidden } = useSidebar();
  
  // NOTE: Auto-collapse logic is now handled in SidebarLayout
  // to prevent layout shifts when data loads

  return (
    <div className="space-y-6">
      {/* Focus Mode Toggle */}
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleFocus}
          className="gap-2"
          aria-label={isHidden ? "Show sidebar" : "Hide sidebar (Focus mode)"}
        >
          {isHidden ? (
            <>
              <Minimize2 className="h-4 w-4" />
              Show Sidebar
            </>
          ) : (
            <>
              <Maximize2 className="h-4 w-4" />
              Focus Mode
            </>
          )}
        </Button>
      </div>
      {children}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle: string;
  primaryAction?: ReactNode;
  stickyFilters: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  /** When true, table area shows skeleton instead of children */
  loading?: boolean;
  loadingPlaceholder?: ReactNode;
};

export function DocumentListShell({
  title,
  subtitle,
  primaryAction,
  stickyFilters,
  children,
  footer,
  loading,
  loadingPlaceholder,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {primaryAction ? <div className="shrink-0">{primaryAction}</div> : null}
      </div>

      <div
        className={cn(
          "sticky top-0 z-20 -mx-1 border-b bg-background/95 px-1 pb-3 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        )}
      >
        {stickyFilters}
      </div>

      <div className="min-h-[240px]">
        {loading && loadingPlaceholder ? loadingPlaceholder : children}
      </div>

      {footer}
    </div>
  );
}

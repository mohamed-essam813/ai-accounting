/**
 * Dashboard Period Filters
 * Single Source of Truth: Period is the ONLY filter for date/time
 * Custom Range is a Period option, not a separate filter
 */

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { Calendar } from "lucide-react";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PeriodMode = 
  | "THIS_MONTH" 
  | "THIS_QUARTER" 
  | "THIS_YEAR"
  | "LAST_MONTH"
  | "LAST_QUARTER"
  | "LAST_YEAR"
  | "CUSTOM";

export type CompareMode = "NONE" | "PREVIOUS" | "SPLY" | "MULTI";

/** Canonical query so ?a=1&b=2 equals ?b=2&a=1 — avoids redundant navigations. */
function canonicalQueryString(qs: string) {
  const raw = qs.startsWith("?") ? qs.slice(1) : qs;
  if (!raw) return "";
  const p = new URLSearchParams(raw);
  const sorted = [...p.entries()].sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(sorted).toString();
}

function isSameDashboardLocation(href: string) {
  if (typeof window === "undefined") return false;
  try {
    const next = new URL(href, window.location.origin);
    const curQ = canonicalQueryString(window.location.search);
    const nextQ = canonicalQueryString(next.search);
    return window.location.pathname === next.pathname && curQ === nextQ;
  } catch {
    return false;
  }
}

type Props = {
  initialPeriodMode?: PeriodMode;
  initialStartDate?: string;
  initialEndDate?: string;
  initialCompareMode?: CompareMode;
  initialMultiN?: 3 | 6 | 12;
  initialMultiUnit?: "MONTH" | "QUARTER" | "YEAR";
  initialCurrency?: string;
  /** Default display currency. Default = tenant base (e.g. USD). */
  baseCurrency?: string;
  currencies?: string[];
};

export function DashboardFilters({
  initialPeriodMode = "THIS_MONTH",
  initialStartDate,
  initialEndDate,
  initialCompareMode = "NONE",
  initialMultiN = 3,
  initialMultiUnit = "MONTH",
  initialCurrency,
  baseCurrency = "USD",
  currencies = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [periodMode, setPeriodMode] = useState<PeriodMode>(initialPeriodMode);
  const [startDate, setStartDate] = useState(initialStartDate || "");
  const [endDate, setEndDate] = useState(initialEndDate || "");
  const [compareMode, setCompareMode] = useState<CompareMode>(initialCompareMode);
  const [multiN, setMultiN] = useState<3 | 6 | 12>(initialMultiN);
  const [multiUnit, setMultiUnit] = useState<"MONTH" | "QUARTER" | "YEAR">(initialMultiUnit);
  const [isPending, startTransition] = useTransition();

  const isCustomRange = periodMode === "CUSTOM";
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /** Stable string — avoids unstable `searchParams` object identity churn in useCallback/useEffect deps. */
  const searchSnapshot = searchParams.toString();

  // Update URL params: preserve currency and any other existing params, only overwrite period/compare.
  const updateParams = useCallback(() => {
    startTransition(() => {
      const params = new URLSearchParams(searchSnapshot);

      // Period mode
      if (periodMode !== "THIS_MONTH") {
        params.set("periodMode", periodMode);
      } else {
        params.delete("periodMode");
      }

      // Custom range dates
      if (isCustomRange && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      } else {
        params.delete("startDate");
        params.delete("endDate");
      }

      // Compare mode
      if (compareMode !== "NONE") {
        params.set("compareMode", compareMode);
      } else {
        params.delete("compareMode");
      }

      // Multi-period settings
      if (compareMode === "MULTI") {
        params.set("multiN", multiN.toString());
        params.set("multiUnit", multiUnit);
      } else {
        params.delete("multiN");
        params.delete("multiUnit");
      }

      const query = params.toString();
      const href = query ? `/dashboard?${query}` : "/dashboard";
      if (isSameDashboardLocation(href)) {
        return;
      }
      router.push(href);
    });
  }, [
    periodMode,
    startDate,
    endDate,
    compareMode,
    multiN,
    multiUnit,
    isCustomRange,
    router,
    searchSnapshot,
  ]);

  // Auto-update when filters change (with debounce)
  useEffect(() => {
    // Only auto-update if we have valid data
    if (isCustomRange && (!startDate || !endDate)) {
      return; // Don't update if custom range is selected but dates are incomplete
    }

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      updateParams();
    }, 500);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [periodMode, startDate, endDate, compareMode, multiN, multiUnit, isCustomRange, updateParams]);

  const handlePeriodChange = (newPeriod: PeriodMode) => {
    setPeriodMode(newPeriod);
    // Clear custom dates when switching away from custom range
    if (newPeriod !== "CUSTOM") {
      setStartDate("");
      setEndDate("");
    }
  };

  const handleCompareChange = (newCompare: CompareMode) => {
    setCompareMode(newCompare);
  };

  const handleMultiNChange = (value: string) => {
    setMultiN(parseInt(value, 10) as 3 | 6 | 12);
  };

  const handleMultiUnitChange = (value: "MONTH" | "QUARTER" | "YEAR") => {
    setMultiUnit(value);
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Single Row Layout: Period | Compare | Currency */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Period Dropdown */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Period:</span>
          <Select
            value={periodMode}
            onValueChange={handlePeriodChange}
            disabled={isPending}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="THIS_MONTH">This Month</SelectItem>
              <SelectItem value="THIS_QUARTER">This Quarter</SelectItem>
              <SelectItem value="THIS_YEAR">This Year</SelectItem>
              <SelectItem value="LAST_MONTH">Last Month</SelectItem>
              <SelectItem value="LAST_QUARTER">Last Quarter</SelectItem>
              <SelectItem value="LAST_YEAR">Last Year</SelectItem>
              <SelectItem value="CUSTOM">Custom Range…</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Custom Range Date Pickers (only shown when Custom Range is selected) */}
        {isCustomRange && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">From:</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40 h-8"
              placeholder="Start Date"
            />
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">To:</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40 h-8"
              placeholder="End Date"
            />
          </div>
        )}

        {/* Compare Dropdown */}
        <div className="flex items-center gap-2 border-l pl-4">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Compare:</span>
          <Select
            value={compareMode}
            onValueChange={handleCompareChange}
            disabled={isPending}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">None</SelectItem>
              <SelectItem value="PREVIOUS">Previous Period</SelectItem>
              <SelectItem value="SPLY">Same Period Last Year</SelectItem>
              <SelectItem value="MULTI">Multi-Period…</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Multi-Period Controls (only shown when Multi-Period is selected) */}
        {compareMode === "MULTI" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Show last:</span>
            <Select
              value={multiN.toString()}
              onValueChange={handleMultiNChange}
              disabled={isPending}
            >
              <SelectTrigger className="w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="6">6</SelectItem>
                <SelectItem value="12">12</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground whitespace-nowrap">Unit:</span>
            <Select
              value={multiUnit}
              onValueChange={handleMultiUnitChange}
              disabled={isPending}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTH">Months</SelectItem>
                <SelectItem value="QUARTER">Quarters</SelectItem>
                <SelectItem value="YEAR">Years</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Currency Filter */}
        <div className="flex items-center gap-2 border-l pl-4 ml-auto">
          <CurrencyFilter
            initialCurrency={initialCurrency}
            baseCurrency={baseCurrency}
            currencies={currencies}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Enhanced Report Filters with Saved Views
 * Excel Elimination Doctrine: Pivot-Table-Level Reporting
 * 
 * Features:
 * - Date range filtering
 * - Quick date presets
 * - Saved views (localStorage)
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Filter, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Enhanced Report Filters with Quick Presets
 * Excel Elimination Doctrine: Pivot-Table-Level Reporting
 */

export function ReportFiltersEnhanced() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [startDate, setStartDate] = useState<string>(
    searchParams.get("startDate") || "",
  );
  const [endDate, setEndDate] = useState<string>(
    searchParams.get("endDate") || "",
  );

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    router.push(`/reports/pnl?${params.toString()}`);
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    router.push("/reports/pnl");
  };

  const setQuickFilter = (preset: "thisMonth" | "lastMonth" | "thisYear" | "lastYear") => {
    const now = new Date();
    let start: Date, end: Date;

    switch (preset) {
      case "thisMonth":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "lastMonth":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case "thisYear":
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      case "lastYear":
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31);
        break;
    }

    const params = new URLSearchParams();
    params.set("startDate", start.toISOString().split("T")[0]);
    params.set("endDate", end.toISOString().split("T")[0]);
    router.push(`/reports/pnl?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setQuickFilter("thisMonth")}
        >
          This Month
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setQuickFilter("lastMonth")}
        >
          Last Month
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setQuickFilter("thisYear")}
        >
          This Year
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-40"
          placeholder="Start Date"
        />
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-40"
          placeholder="End Date"
        />
        <Button onClick={applyFilters} size="sm">
          <Filter className="h-4 w-4 mr-2" />
          Apply
        </Button>
        {(startDate || endDate) && (
          <Button onClick={clearFilters} variant="outline" size="sm">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}


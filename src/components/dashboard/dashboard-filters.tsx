/**
 * Dashboard Period Filters
 * Allows users to select the period for comparison (presets or custom dates)
 */

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useTransition } from "react";
import { Filter, X, Calendar } from "lucide-react";

type Props = {
  initialPeriod?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  initialComparisonType?: "previous" | "lastYear";
};

export function DashboardFilters({
  initialPeriod,
  initialStartDate,
  initialEndDate,
  initialComparisonType = "previous",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState(initialPeriod || "month");
  const [startDate, setStartDate] = useState(initialStartDate || "");
  const [endDate, setEndDate] = useState(initialEndDate || "");
  const [comparisonType, setComparisonType] = useState<"previous" | "lastYear">(initialComparisonType);
  const [isPending, startTransition] = useTransition();

  const isCustomDate = startDate || endDate;

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    setStartDate("");
    setEndDate("");
    startTransition(() => {
      const params = new URLSearchParams();
      if (newPeriod !== "month") {
        params.set("period", newPeriod);
      }
      if (comparisonType !== "previous") {
        params.set("compare", comparisonType);
      }
      router.push(`/dashboard?${params.toString()}`);
    });
  };

  const handleComparisonChange = (newType: "previous" | "lastYear") => {
    setComparisonType(newType);
    startTransition(() => {
      const params = new URLSearchParams();
      if (period !== "month") {
        params.set("period", period);
      }
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (newType !== "previous") {
        params.set("compare", newType);
      }
      router.push(`/dashboard?${params.toString()}`);
    });
  };

  const handleCustomDateApply = () => {
    if (!startDate || !endDate) return;
    
    setPeriod("custom");
    startTransition(() => {
      const params = new URLSearchParams();
      params.set("startDate", startDate);
      params.set("endDate", endDate);
      router.push(`/dashboard?${params.toString()}`);
    });
  };

  const handleClear = () => {
    setPeriod("month");
    setStartDate("");
    setEndDate("");
    startTransition(() => {
      router.push("/dashboard");
    });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      {/* Preset Period Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Period:</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={period === "month" && !isCustomDate ? "default" : "outline"}
            size="sm"
            onClick={() => handlePeriodChange("month")}
            disabled={isPending}
          >
            This Month
          </Button>
          <Button
            variant={period === "quarter" && !isCustomDate ? "default" : "outline"}
            size="sm"
            onClick={() => handlePeriodChange("quarter")}
            disabled={isPending}
          >
            This Quarter
          </Button>
          <Button
            variant={period === "year" && !isCustomDate ? "default" : "outline"}
            size="sm"
            onClick={() => handlePeriodChange("year")}
            disabled={isPending}
          >
            This Year
          </Button>
        </div>
        
        {/* Comparison Type Toggle */}
        <div className="flex items-center gap-2 ml-auto border-l pl-3">
          <span className="text-xs text-muted-foreground">Compare with:</span>
          <Button
            variant={comparisonType === "previous" ? "default" : "outline"}
            size="sm"
            onClick={() => handleComparisonChange("previous")}
            disabled={isPending}
          >
            Previous Period
          </Button>
          <Button
            variant={comparisonType === "lastYear" ? "default" : "outline"}
            size="sm"
            onClick={() => handleComparisonChange("lastYear")}
            disabled={isPending}
          >
            Same Period Last Year
          </Button>
        </div>
      </div>

      {/* Custom Date Range */}
      <div className="flex flex-wrap items-end gap-4 border-t pt-3">
        <div className="flex items-end gap-2">
          <span className="text-xs text-muted-foreground mb-1.5">Custom Range:</span>
        </div>
        <div className="flex flex-col space-y-1">
          <label className="text-xs text-muted-foreground">Start Date</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
            placeholder="Start Date"
          />
        </div>
        <div className="flex flex-col space-y-1">
          <label className="text-xs text-muted-foreground">End Date</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
            placeholder="End Date"
          />
        </div>
        <Button
          onClick={handleCustomDateApply}
          size="sm"
          disabled={isPending || !startDate || !endDate}
          className="h-9"
        >
          <Filter className="h-4 w-4 mr-2" />
          Apply
        </Button>
        {(isCustomDate || period !== "month") && (
          <Button
            onClick={handleClear}
            variant="outline"
            size="sm"
            disabled={isPending}
            className="h-9"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}


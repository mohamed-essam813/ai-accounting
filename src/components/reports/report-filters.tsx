"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useTransition } from "react";

type Props = {
  initialStartDate?: string;
  initialEndDate?: string;
};

export function ReportFilters({ initialStartDate, initialEndDate }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [startDate, setStartDate] = useState(initialStartDate ?? "");
  const [endDate, setEndDate] = useState(initialEndDate ?? "");
  const [isPending, startTransition] = useTransition();

  const applyDateRange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", start);
      params.set("endDate", end);
      router.push(`?${params.toString()}`);
    });
  };

  const handleApply = () => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (startDate) {
        params.set("startDate", startDate);
      } else {
        params.delete("startDate");
      }
      if (endDate) {
        params.set("endDate", endDate);
      } else {
        params.delete("endDate");
      }
      router.push(`?${params.toString()}`);
    });
  };

  const handleClear = () => {
    setStartDate("");
    setEndDate("");
    startTransition(() => {
      router.push("?");
    });
  };

  // Preset date ranges
  const getPresetDates = (preset: "monthly" | "quarterly" | "yearly") => {
    const today = new Date();
    let start: Date;
    let end = new Date(today);

    switch (preset) {
      case "monthly":
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case "quarterly":
        const quarter = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), quarter * 3, 1);
        break;
      case "yearly":
        start = new Date(today.getFullYear(), 0, 1);
        break;
    }

    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Start Date</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">End Date</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
        </div>
        <Button onClick={handleApply} disabled={isPending} size="sm">
          Apply Filters
        </Button>
        {(startDate || endDate) && (
          <Button onClick={handleClear} variant="outline" size="sm" disabled={isPending}>
            Clear
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">Presets:</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const dates = getPresetDates("monthly");
            applyDateRange(dates.start, dates.end);
          }}
          disabled={isPending}
        >
          This Month
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const dates = getPresetDates("quarterly");
            applyDateRange(dates.start, dates.end);
          }}
          disabled={isPending}
        >
          This Quarter
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const dates = getPresetDates("yearly");
            applyDateRange(dates.start, dates.end);
          }}
          disabled={isPending}
        >
          This Year
        </Button>
      </div>
    </div>
  );
}


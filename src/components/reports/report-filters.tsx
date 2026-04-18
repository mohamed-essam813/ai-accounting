"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useTransition, useEffect } from "react";
import {
  REPORT_DATE_STORAGE_KEY,
  defaultDateRangeForTab,
  isThisMonthHighlighted,
  lastMonthPreset,
  lastQuarterPreset,
  thisMonthPreset,
  thisQuarterPreset,
  thisYearPreset,
  yearToDatePreset,
  type ReportTabId,
  type StoredReportDateRanges,
} from "@/lib/reports/report-date-defaults";

type Props = {
  initialStartDate?: string;
  initialEndDate?: string;
  reportTab: ReportTabId;
};

function saveRangeForTab(tab: ReportTabId, start: string, end: string) {
  try {
    const raw = localStorage.getItem(REPORT_DATE_STORAGE_KEY);
    const parsed: StoredReportDateRanges = raw ? (JSON.parse(raw) as StoredReportDateRanges) : {};
    parsed[tab] = { startDate: start, endDate: end };
    localStorage.setItem(REPORT_DATE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

export function ReportFilters({ initialStartDate, initialEndDate, reportTab }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") || reportTab || "pnl") as ReportTabId;
  const [startDate, setStartDate] = useState(initialStartDate ?? "");
  const [endDate, setEndDate] = useState(initialEndDate ?? "");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setStartDate(initialStartDate ?? "");
    setEndDate(initialEndDate ?? "");
  }, [initialStartDate, initialEndDate]);

  const pushRange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    saveRangeForTab(tab, start, end);
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", start);
      params.set("endDate", end);
      router.push(`?${params.toString()}`);
    });
  };

  const applyDateRange = (start: string, end: string) => {
    pushRange(start, end);
  };

  const handleApply = () => {
    if (!startDate || !endDate) return;
    pushRange(startDate, endDate);
  };

  const handleClear = () => {
    const defaults = defaultDateRangeForTab(tab);
    pushRange(defaults.startDate, defaults.endDate);
  };

  const thisMonth = thisMonthPreset();
  const thisQuarter = thisQuarterPreset();
  const thisYear = thisYearPreset();
  const lastMonth = lastMonthPreset();
  const lastQ = lastQuarterPreset();
  const ytd = yearToDatePreset();

  const presetVariant = (start: string, end: string) =>
    startDate === start && endDate === end ? "default" : "outline";

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
        <Button onClick={handleApply} disabled={isPending || !startDate || !endDate} size="sm">
          Apply Filters
        </Button>
        <Button onClick={handleClear} variant="outline" size="sm" disabled={isPending}>
          Reset to tab default
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">Presets:</span>
        <Button
          variant={isThisMonthHighlighted(startDate, endDate) ? "default" : "outline"}
          size="sm"
          onClick={() => applyDateRange(thisMonth.startDate, thisMonth.endDate)}
          disabled={isPending}
        >
          This Month
        </Button>
        <Button
          variant={presetVariant(lastMonth.startDate, lastMonth.endDate)}
          size="sm"
          onClick={() => applyDateRange(lastMonth.startDate, lastMonth.endDate)}
          disabled={isPending}
        >
          Last Month
        </Button>
        <Button
          variant={presetVariant(thisQuarter.startDate, thisQuarter.endDate)}
          size="sm"
          onClick={() => applyDateRange(thisQuarter.startDate, thisQuarter.endDate)}
          disabled={isPending}
        >
          This Quarter
        </Button>
        <Button
          variant={presetVariant(lastQ.startDate, lastQ.endDate)}
          size="sm"
          onClick={() => applyDateRange(lastQ.startDate, lastQ.endDate)}
          disabled={isPending}
        >
          Last Quarter
        </Button>
        <Button
          variant={presetVariant(ytd.startDate, ytd.endDate)}
          size="sm"
          onClick={() => applyDateRange(ytd.startDate, ytd.endDate)}
          disabled={isPending}
        >
          Year to Date
        </Button>
        <Button
          variant={presetVariant(thisYear.startDate, thisYear.endDate)}
          size="sm"
          onClick={() => applyDateRange(thisYear.startDate, thisYear.endDate)}
          disabled={isPending}
        >
          This Year
        </Button>
      </div>
    </div>
  );
}

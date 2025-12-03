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

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
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
  );
}


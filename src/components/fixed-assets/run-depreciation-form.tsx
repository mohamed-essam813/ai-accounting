"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runMonthlyDepreciationAction } from "@/lib/actions/fixed-assets";
import { toast } from "sonner";

function firstDayOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function RunDepreciationForm() {
  const [pending, setPending] = useState(false);
  const [period, setPeriod] = useState(() => firstDayOfMonth(new Date()));

  const run = async () => {
    setPending(true);
    try {
      await runMonthlyDepreciationAction({ periodStart: period });
      toast.success("Depreciation run completed for " + period);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Depreciation failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="dep-period">Period (month)</Label>
        <Input
          id="dep-period"
          type="month"
          className="w-[200px]"
          value={period.slice(0, 7)}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setPeriod(`${v}-01`);
          }}
        />
        <p className="text-xs text-muted-foreground">Posts Dr Depreciation / Cr Accumulated Depreciation per asset.</p>
      </div>
      <Button type="button" variant="secondary" disabled={pending} onClick={run}>
        {pending ? "Running…" : "Run depreciation"}
      </Button>
    </div>
  );
}

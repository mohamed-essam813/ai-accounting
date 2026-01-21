"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  initialPeriodCount?: string;
  initialPeriodType?: "months" | "quarters" | "years";
};

export function MultiPeriodSelector({
  initialPeriodCount = "3",
  initialPeriodType = "months",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handlePeriodCountChange = (count: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("periodCount", count);
      if (!params.has("periodType")) {
        params.set("periodType", initialPeriodType);
      }
      router.push(`?${params.toString()}`);
    });
  };

  const handlePeriodTypeChange = (type: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("periodType", type);
      if (!params.has("periodCount")) {
        params.set("periodCount", initialPeriodCount);
      }
      router.push(`?${params.toString()}`);
    });
  };

  const handleReset = () => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("periodCount");
      params.delete("periodType");
      router.push(`?${params.toString()}`);
    });
  };

  const periodCount = searchParams.get("periodCount") || initialPeriodCount;
  const periodType = (searchParams.get("periodType") as "months" | "quarters" | "years") || initialPeriodType;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Multi-Period Comparison</Label>
            {(periodCount !== initialPeriodCount || periodType !== initialPeriodType) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={isPending}
                className="h-7 text-xs"
              >
                Reset
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="period-count" className="text-xs text-muted-foreground whitespace-nowrap">
                Show last:
              </Label>
              <Select
                value={periodCount}
                onValueChange={handlePeriodCountChange}
                disabled={isPending}
              >
                <SelectTrigger id="period-count" className="w-20 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodType === "months" && (
                    <>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="6">6</SelectItem>
                      <SelectItem value="12">12</SelectItem>
                    </>
                  )}
                  {periodType === "quarters" && (
                    <>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="8">8</SelectItem>
                    </>
                  )}
                  {periodType === "years" && (
                    <>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="period-type" className="text-xs text-muted-foreground whitespace-nowrap">
                Periods:
              </Label>
              <Select
                value={periodType}
                onValueChange={handlePeriodTypeChange}
                disabled={isPending}
              >
                <SelectTrigger id="period-type" className="w-32 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="months">Months</SelectItem>
                  <SelectItem value="quarters">Quarters</SelectItem>
                  <SelectItem value="years">Years</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Compare financial metrics across {periodCount} {periodType} to identify trends and patterns.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

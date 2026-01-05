/**
 * Revenue Trend Chart
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows revenue trend with period comparison, delta, and interpretation
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";

interface Props {
  currentRevenue: number;
  previousRevenue: number;
  comparison: PeriodComparison;
}

export function RevenueChart({ currentRevenue, previousRevenue, comparison }: Props) {
  const { direction, percentageChange, difference } = comparison;
  const absPercentage = Math.abs(percentageChange);
  const absDifference = Math.abs(difference);

  const directionConfig = {
    up: {
      icon: ArrowUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      interpretation: `Revenue increased by ${absPercentage.toFixed(1)}% compared to the previous period, representing ${formatCurrency(absDifference)} in additional revenue. This indicates positive business momentum.`,
    },
    down: {
      icon: ArrowDown,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      interpretation: `Revenue decreased by ${absPercentage.toFixed(1)}% compared to the previous period, representing ${formatCurrency(absDifference)} less revenue. Monitor trends to identify causes.`,
    },
    stable: {
      icon: Minus,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      interpretation: `Revenue remained stable compared to the previous period, with minimal change (${formatCurrency(absDifference)}). This indicates consistent performance.`,
    },
  };

  const config = directionConfig[direction];
  const Icon = config.icon;

  // Simple bar chart visualization
  const maxValue = Math.max(currentRevenue, previousRevenue, 1);
  const currentHeight = (currentRevenue / maxValue) * 100;
  const previousHeight = (previousRevenue / maxValue) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue Trend</CardTitle>
        <p className="text-sm text-muted-foreground">
          Current period vs previous period comparison
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chart Visualization */}
        <div className="space-y-4">
          <div className="flex items-end gap-6 h-48">
            {/* Previous Period Bar */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex flex-col items-center justify-end h-full">
                <div
                  className="w-full bg-muted rounded-t transition-all"
                  style={{ height: `${previousHeight}%` }}
                >
                  <div className="h-full bg-blue-200 rounded-t" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Previous</p>
                <p className="text-sm font-medium">{formatCurrency(previousRevenue)}</p>
              </div>
            </div>

            {/* Current Period Bar */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex flex-col items-center justify-end h-full">
                <div
                  className={`w-full rounded-t transition-all ${config.bgColor} ${config.borderColor} border-2`}
                  style={{ height: `${currentHeight}%` }}
                >
                  <div className={`h-full ${direction === "up" ? "bg-green-500" : direction === "down" ? "bg-red-500" : "bg-blue-500"} rounded-t`} />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Current</p>
                <p className="text-sm font-semibold">{formatCurrency(currentRevenue)}</p>
              </div>
            </div>
          </div>

          {/* Comparison Metrics */}
          <div className={`p-3 rounded-md ${config.bgColor} ${config.borderColor} border`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 ${config.color}`} />
              <span className={`text-sm font-semibold ${config.color}`}>
                {direction === "up"
                  ? `+${absPercentage.toFixed(1)}% increase`
                  : direction === "down"
                    ? `-${absPercentage.toFixed(1)}% decrease`
                    : "No significant change"}
              </span>
              <span className="text-sm text-muted-foreground">
                ({direction === "up" ? "+" : direction === "down" ? "-" : ""}
                {formatCurrency(absDifference)})
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {config.interpretation}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


/**
 * Cash Flow Trend Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows cash flow trend with period comparison, delta, and interpretation
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";

interface Props {
  currentCashFlow: number;
  previousCashFlow: number;
  comparison: PeriodComparison;
}

export function CashFlowChart({ currentCashFlow, previousCashFlow, comparison }: Props) {
  const { direction, percentageChange, difference } = comparison;
  const absPercentage = Math.abs(percentageChange);
  const absDifference = Math.abs(difference);

  const directionConfig = {
    up: {
      icon: ArrowUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      interpretation: `Cash flow improved by ${absPercentage.toFixed(1)}% this period (${formatCurrency(absDifference)} more). This indicates healthier cash generation from operations.`,
    },
    down: {
      icon: ArrowDown,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      interpretation: `Cash flow declined by ${absPercentage.toFixed(1)}% this period (${formatCurrency(absDifference)} less). Monitor collections and payment timing.`,
    },
    stable: {
      icon: Minus,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      interpretation: `Cash flow remained stable this period. No significant change in cash generation patterns.`,
    },
  };

  const config = directionConfig[direction];
  const Icon = config.icon;

  // Simple bar chart visualization
  const maxValue = Math.max(Math.abs(currentCashFlow), Math.abs(previousCashFlow), 1);
  const currentHeight = (Math.abs(currentCashFlow) / maxValue) * 100;
  const previousHeight = (Math.abs(previousCashFlow) / maxValue) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cash Flow Trend</CardTitle>
        <p className="text-xs text-muted-foreground">
          Current vs previous period
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Chart Visualization */}
        <div className="flex items-end gap-6 h-40">
          {/* Previous Period Bar */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex flex-col items-center justify-end h-full">
              <div
                className="w-full bg-muted rounded-t-md transition-all shadow-sm hover:shadow-md"
                style={{ height: `${Math.max(previousHeight, 5)}%` }}
              >
                <div className={`h-full ${previousCashFlow >= 0 ? "bg-blue-400" : "bg-red-400"} rounded-t-md`} />
              </div>
            </div>
            <div className="text-center mt-2">
              <p className="text-xs font-medium text-muted-foreground">Previous</p>
              <p className="text-xs font-medium mt-0.5">{formatCurrency(previousCashFlow)}</p>
            </div>
          </div>

          {/* Current Period Bar */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex flex-col items-center justify-end h-full">
              <div
                className={`w-full rounded-t-md transition-all shadow-md hover:shadow-lg border-2 ${config.bgColor} ${config.borderColor}`}
                style={{ height: `${Math.max(currentHeight, 5)}%` }}
              >
                <div className={`h-full rounded-t-md ${currentCashFlow >= 0 ? (direction === "up" ? "bg-green-500" : "bg-green-400") : (direction === "down" ? "bg-red-500" : "bg-red-400")}`} />
              </div>
            </div>
            <div className="text-center mt-2">
              <p className="text-xs font-semibold">Current</p>
              <p className="text-xs font-semibold mt-0.5">{formatCurrency(currentCashFlow)}</p>
            </div>
          </div>
        </div>

        {/* Comparison Metrics */}
        <div className={`p-2 rounded-md ${config.bgColor} ${config.borderColor} border`}>
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`h-3 w-3 ${config.color}`} />
            <span className={`text-xs font-semibold ${config.color}`}>
              {direction === "up"
                ? `+${absPercentage.toFixed(1)}%`
                : direction === "down"
                  ? `-${absPercentage.toFixed(1)}%`
                  : "No change"}
            </span>
            <span className="text-xs text-muted-foreground">
              ({direction === "up" ? "+" : direction === "down" ? "-" : ""}
              {formatCurrency(absDifference)})
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {config.interpretation}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}


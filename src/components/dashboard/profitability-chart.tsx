/**
 * Profitability Trend Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows net income margin trends with period comparison
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";

interface Props {
  currentRevenue: number;
  previousRevenue: number;
  currentNetIncome: number;
  previousNetIncome: number;
  netIncomeComparison: PeriodComparison;
}

export function ProfitabilityChart({
  currentRevenue,
  previousRevenue,
  currentNetIncome,
  previousNetIncome,
  netIncomeComparison,
}: Props) {
  const { direction, percentageChange, difference } = netIncomeComparison;
  const absPercentage = Math.abs(percentageChange);
  const absDifference = Math.abs(difference);

  // Calculate profit margins
  const currentMargin = currentRevenue !== 0 ? (currentNetIncome / currentRevenue) * 100 : 0;
  const previousMargin = previousRevenue !== 0 ? (previousNetIncome / previousRevenue) * 100 : 0;
  const marginChange = currentMargin - previousMargin;

  const directionConfig = {
    up: {
      icon: ArrowUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      interpretation: `Profitability improved by ${absPercentage.toFixed(1)}% (${formatCurrency(absDifference)} more net income). Margin increased from ${previousMargin.toFixed(1)}% to ${currentMargin.toFixed(1)}%. Business efficiency is improving.`,
    },
    down: {
      icon: ArrowDown,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      interpretation: `Profitability declined by ${absPercentage.toFixed(1)}% (${formatCurrency(absDifference)} less net income). Margin decreased from ${previousMargin.toFixed(1)}% to ${currentMargin.toFixed(1)}%. Review cost structure and pricing.`,
    },
    stable: {
      icon: Minus,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      interpretation: `Profitability remained stable. Net income margin is ${currentMargin.toFixed(1)}%, consistent with previous period. Maintain current operational efficiency.`,
    },
  };

  const config = directionConfig[direction];
  const Icon = config.icon;

  // Chart visualization - show net income bars
  const maxValue = Math.max(
    Math.abs(currentNetIncome),
    Math.abs(previousNetIncome),
    Math.abs(currentRevenue) * 0.3, // Show up to 30% of revenue as max scale
    1,
  );
  const currentHeight = (Math.abs(currentNetIncome) / maxValue) * 100;
  const previousHeight = (Math.abs(previousNetIncome) / maxValue) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profitability Trend</CardTitle>
        <p className="text-xs text-muted-foreground">
          Net income margin comparison
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
                <div
                  className={`h-full rounded-t-md ${
                    previousNetIncome >= 0 ? "bg-blue-400" : "bg-red-400"
                  }`}
                />
              </div>
            </div>
            <div className="text-center mt-2">
              <p className="text-xs font-medium text-muted-foreground">Previous</p>
              <p className="text-xs font-medium mt-0.5">
                {formatCurrency(previousNetIncome)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {previousMargin.toFixed(1)}% margin
              </p>
            </div>
          </div>

          {/* Current Period Bar */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex flex-col items-center justify-end h-full">
              <div
                className={`w-full rounded-t-md transition-all shadow-md hover:shadow-lg border-2 ${config.bgColor} ${config.borderColor}`}
                style={{ height: `${Math.max(currentHeight, 5)}%` }}
              >
                <div
                  className={`h-full rounded-t-md ${
                    currentNetIncome >= 0
                      ? direction === "up"
                        ? "bg-green-500"
                        : "bg-green-400"
                      : direction === "down"
                        ? "bg-red-500"
                        : "bg-red-400"
                  }`}
                />
              </div>
            </div>
            <div className="text-center mt-2">
              <p className="text-xs font-semibold">Current</p>
              <p className="text-xs font-semibold mt-0.5">
                {formatCurrency(currentNetIncome)}
              </p>
              <p className="text-xs font-medium text-foreground mt-0.5">
                {currentMargin.toFixed(1)}% margin
              </p>
            </div>
          </div>
        </div>

        {/* Comparison Metrics */}
        <div className={`p-2 rounded-md ${config.bgColor} ${config.borderColor} border`}>
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`h-3 w-3 ${config.color}`} />
            <span className={`text-xs font-semibold ${config.color}`}>
              {direction === "up"
                ? `+${absPercentage.toFixed(1)}% increase`
                : direction === "down"
                  ? `-${absPercentage.toFixed(1)}% decrease`
                  : "No significant change"}
            </span>
            <span className="text-xs text-muted-foreground">
              ({direction === "up" ? "+" : direction === "down" ? "-" : ""}
              {formatCurrency(absDifference)})
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Margin:</span>
            <span className="font-medium">
              {previousMargin.toFixed(1)}% → {currentMargin.toFixed(1)}%
            </span>
            {marginChange !== 0 && (
              <span className={marginChange > 0 ? "text-green-600" : "text-red-600"}>
                ({marginChange > 0 ? "+" : ""}
                {marginChange.toFixed(1)}pp)
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {config.interpretation}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}


/**
 * Profitability Trend Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows net income margin trends with period comparison
 * Uses Recharts for line chart with threshold bands
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ChipTooltip } from "./chip-tooltip";

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

  // Chart data for line chart
  const chartData = [
    {
      period: "Previous",
      netIncome: previousNetIncome,
      margin: previousMargin,
    },
    {
      period: "Current",
      netIncome: currentNetIncome,
      margin: currentMargin,
    },
  ];

  // Empty state handling
  if (currentRevenue === 0 && previousRevenue === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profitability Trend</CardTitle>
          <p className="text-xs text-muted-foreground">
            Net income margin comparison
          </p>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No data available for this period</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profitability Trend</CardTitle>
        <p className="text-xs text-muted-foreground">
          Net income margin comparison
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Line Chart with Threshold Bands */}
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis 
              yAxisId="left"
              tickFormatter={(value: number) => formatCurrency(value)}
              label={{ value: "Net Income", angle: -90, position: "insideLeft" }}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              tickFormatter={(value: number) => `${value}%`}
              label={{ value: "Margin %", angle: 90, position: "insideRight" }}
            />
            <Tooltip 
              content={<ChipTooltip />}
            />
            {/* Threshold lines */}
            <ReferenceLine yAxisId="right" y={10} stroke="#10b981" strokeDasharray="5 5" label="10% Target" />
            <ReferenceLine yAxisId="right" y={0} stroke="#ef4444" strokeDasharray="3 3" />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="netIncome" 
              stroke="#3b82f6" 
              strokeWidth={2}
              name="Net Income"
              dot={{ r: 6 }}
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="margin" 
              stroke="#10b981" 
              strokeWidth={2}
              strokeDasharray="5 5"
              name="Margin %"
              dot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>

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

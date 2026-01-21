/**
 * AR/AP Ageing Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows receivables and payables outstanding trends with period comparison
 * Uses Recharts for horizontal stacked bars
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChipTooltip } from "./chip-tooltip";

interface Props {
  currentAR: number;
  previousAR: number;
  currentAP: number;
  previousAP: number;
  arComparison: PeriodComparison;
  apComparison: PeriodComparison;
}

export function ARAPAgeingChart({
  currentAR,
  previousAR,
  currentAP,
  previousAP,
  arComparison,
  apComparison,
}: Props) {
  const arDirection = arComparison.direction;
  const apDirection = apComparison.direction;
  const arChange = Math.abs(arComparison.percentageChange);
  const apChange = Math.abs(apComparison.percentageChange);

  // Calculate net working capital trend
  const currentNetWC = currentAR - currentAP;
  const previousNetWC = previousAR - previousAP;
  const netWCChange = currentNetWC - previousNetWC;

  // Determine interpretation
  let interpretation = "";
  if (arDirection === "down" && apDirection === "down") {
    interpretation = `Both receivables and payables decreased. Collections and payments are improving, reducing working capital requirements.`;
  } else if (arDirection === "down" && apDirection === "up") {
    interpretation = `Receivables decreased ${arChange.toFixed(1)}% while payables increased ${apChange.toFixed(1)}%. Collections improved but payment pressure is rising.`;
  } else if (arDirection === "up" && apDirection === "down") {
    interpretation = `Receivables increased ${arChange.toFixed(1)}% while payables decreased ${apChange.toFixed(1)}%. Slower collections but better payment management.`;
  } else if (arDirection === "up" && apDirection === "up") {
    interpretation = `Both receivables and payables increased. Working capital requirements are growing. Monitor collection efficiency.`;
  } else {
    const trend = netWCChange > 0 ? "increased" : netWCChange < 0 ? "decreased" : "remained stable";
    interpretation = `Working capital ${trend} by ${formatCurrency(Math.abs(netWCChange))}. ${arDirection === "stable" && apDirection === "stable" ? "Both AR and AP are stable." : "Monitor collection and payment cycles."}`;
  }

  // Chart data for horizontal grouped bars (side-by-side comparison)
  const chartData = [
    {
      period: "Previous",
      ar: previousAR,
      ap: previousAP,
    },
    {
      period: "Current",
      ar: currentAR,
      ap: currentAP,
    },
  ];

  // Empty state handling
  if (currentAR === 0 && previousAR === 0 && currentAP === 0 && previousAP === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AR/AP Ageing Trend</CardTitle>
          <p className="text-xs text-muted-foreground">
            Receivables vs Payables outstanding
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
        <CardTitle className="text-base">AR/AP Ageing Trend</CardTitle>
        <p className="text-xs text-muted-foreground">
          Receivables vs Payables outstanding
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Horizontal Grouped Bar Chart - Better for comparison */}
        <ResponsiveContainer width="100%" height={320}>
          <BarChart 
            data={chartData} 
            layout="vertical"
            margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
            <XAxis 
              type="number" 
              tickFormatter={(value: number) => formatCurrency(value)}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              axisLine={{ stroke: "#d1d5db" }}
            />
            <YAxis 
              dataKey="period" 
              type="category" 
              width={90}
              tick={{ fill: "#6b7280", fontSize: 12 }}
              axisLine={{ stroke: "#d1d5db" }}
            />
            <Tooltip 
              content={<ChipTooltip />}
              cursor={{ fill: "rgba(0, 0, 0, 0.05)" }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: "10px" }}
              iconType="square"
            />
            <Bar 
              dataKey="ar" 
              fill="#10b981" 
              name="Accounts Receivable"
              radius={[0, 6, 6, 0]}
              barSize={35}
              label={false}
            />
            <Bar 
              dataKey="ap" 
              fill="#ef4444" 
              name="Accounts Payable"
              radius={[0, 6, 6, 0]}
              barSize={35}
              label={false}
            />
          </BarChart>
        </ResponsiveContainer>

        {/* Comparison Metrics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-md bg-blue-50 border border-blue-200">
            <div className="flex items-center gap-1 mb-1">
              {arDirection === "down" ? (
                <ArrowDown className="h-3 w-3 text-green-600" />
              ) : arDirection === "up" ? (
                <ArrowUp className="h-3 w-3 text-red-600" />
              ) : (
                <Minus className="h-3 w-3 text-blue-600" />
              )}
              <span className="font-semibold">AR</span>
              <span className="text-muted-foreground">
                {arDirection === "down" ? "-" : arDirection === "up" ? "+" : ""}
                {arChange.toFixed(1)}%
              </span>
            </div>
            <p className="text-muted-foreground">{formatCurrency(currentAR)}</p>
          </div>
          <div className="p-2 rounded-md bg-orange-50 border border-orange-200">
            <div className="flex items-center gap-1 mb-1">
              {apDirection === "down" ? (
                <ArrowDown className="h-3 w-3 text-green-600" />
              ) : apDirection === "up" ? (
                <ArrowUp className="h-3 w-3 text-red-600" />
              ) : (
                <Minus className="h-3 w-3 text-blue-600" />
              )}
              <span className="font-semibold">AP</span>
              <span className="text-muted-foreground">
                {apDirection === "up" ? "+" : apDirection === "down" ? "-" : ""}
                {apChange.toFixed(1)}%
              </span>
            </div>
            <p className="text-muted-foreground">{formatCurrency(currentAP)}</p>
          </div>
        </div>

        {/* Interpretation */}
        <div className="p-2 rounded-md bg-muted border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {interpretation}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

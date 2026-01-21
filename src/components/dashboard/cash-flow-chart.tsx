/**
 * Cash Flow Waterfall Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows cash flow trend with period comparison
 * Uses Recharts for waterfall visualization
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { ChipTooltip } from "./chip-tooltip";

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

  // Waterfall chart data with color coding
  const changeValue = currentCashFlow - previousCashFlow;
  // Always show all three bars for waterfall visualization
  const waterfallData: Array<{ name: string; value: number; fill: string }> = [
    { 
      name: "Starting", 
      value: previousCashFlow, 
      fill: "#3b82f6",
    },
    { 
      name: "Change", 
      value: changeValue, 
      fill: changeValue >= 0 ? "#10b981" : changeValue < 0 ? "#ef4444" : "#94a3b8",
    },
    { 
      name: "Ending", 
      value: currentCashFlow, 
      fill: "#6366f1",
    },
  ];

  // Custom label renderer with dark grey text and background for maximum contrast
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderBarLabel = (props: any) => {
    const { x = 0, y = 0, width = 0, value } = props;
    if (value === undefined || Math.abs(value || 0) < 0.01 || !width) return null;
    
    const textX = x + width / 2;
    const textY = y - 8;
    const textValue = formatCurrency(value);
    
    return (
      <g>
        {/* Background rectangle for better contrast */}
        <rect
          x={textX - (textValue.length * 3.5)}
          y={textY - 8}
          width={textValue.length * 7}
          height={16}
          fill="rgba(255, 255, 255, 0.9)"
          rx={4}
          stroke="rgba(0, 0, 0, 0.1)"
          strokeWidth={1}
        />
        {/* Dark grey text for readability on all bar colors */}
        <text
          x={textX}
          y={textY}
          fill="#1f2937"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontSize: "11px",
            fontWeight: "600",
            letterSpacing: "0.2px",
          }}
        >
          {textValue}
        </text>
      </g>
    );
  };

  // Empty state handling
  if (currentCashFlow === 0 && previousCashFlow === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash Flow Trend</CardTitle>
          <p className="text-xs text-muted-foreground">
            Current vs previous period
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
        <CardTitle className="text-base">Cash Flow Trend</CardTitle>
        <p className="text-xs text-muted-foreground">
          Current vs previous period
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Waterfall Chart Visualization */}
        <ResponsiveContainer width="100%" height={320}>
          <BarChart 
            data={waterfallData}
            margin={{ top: 30, right: 10, left: 10, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
            <XAxis 
              dataKey="name" 
              tick={{ fill: "#6b7280", fontSize: 12 }}
              axisLine={{ stroke: "#d1d5db" }}
            />
            <YAxis 
              tickFormatter={(value: number) => formatCurrency(value)}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              axisLine={{ stroke: "#d1d5db" }}
              width={80}
            />
            <Tooltip 
              content={<ChipTooltip />}
              cursor={{ fill: "rgba(0, 0, 0, 0.05)" }}
            />
            <Bar 
              dataKey="value" 
              radius={[6, 6, 0, 0]}
              barSize={60}
            >
              {waterfallData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.fill}
                  stroke={entry.fill}
                  strokeWidth={1}
                />
              ))}
              <LabelList dataKey="value" content={renderBarLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

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

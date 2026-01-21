/**
 * Revenue vs Expense Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows revenue and expense trends with period comparison
 * Uses Recharts for proper visualization
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";
import { ChipTooltip } from "./chip-tooltip";

interface Props {
  currentRevenue: number;
  previousRevenue: number;
  currentExpenses: number;
  previousExpenses: number;
  revenueComparison: PeriodComparison;
  expenseComparison: PeriodComparison;
}

export function RevenueExpenseChart({
  currentRevenue,
  previousRevenue,
  currentExpenses,
  previousExpenses,
  revenueComparison,
  expenseComparison,
}: Props) {
  const revenueDirection = revenueComparison.direction;
  const expenseDirection = expenseComparison.direction;
  const revenueChange = Math.abs(revenueComparison.percentageChange);
  const expenseChange = Math.abs(expenseComparison.percentageChange);

  // Calculate profitability trend
  const currentProfit = currentRevenue - currentExpenses;
  const previousProfit = previousRevenue - previousExpenses;
  const profitChange = currentProfit - previousProfit;
  const profitChangePercent = previousProfit !== 0 ? (profitChange / Math.abs(previousProfit)) * 100 : 0;

  // Determine interpretation
  let interpretation = "";
  if (revenueDirection === "up" && expenseDirection === "down") {
    interpretation = `Revenue increased ${revenueChange.toFixed(1)}% while expenses decreased ${expenseChange.toFixed(1)}%. Profitability improved significantly.`;
  } else if (revenueDirection === "up" && expenseDirection === "up" && revenueChange > expenseChange) {
    interpretation = `Revenue grew faster (${revenueChange.toFixed(1)}%) than expenses (${expenseChange.toFixed(1)}%). Profitability is improving.`;
  } else if (revenueDirection === "up" && expenseDirection === "up" && expenseChange > revenueChange) {
    interpretation = `Expenses grew faster (${expenseChange.toFixed(1)}%) than revenue (${revenueChange.toFixed(1)}%). Monitor cost control.`;
  } else if (revenueDirection === "down" && expenseDirection === "up") {
    interpretation = `Revenue decreased ${revenueChange.toFixed(1)}% while expenses increased ${expenseChange.toFixed(1)}%. Profitability is under pressure.`;
  } else {
    interpretation = `Revenue and expenses trends are ${revenueDirection === "stable" ? "stable" : "mixed"}. Profitability ${profitChange > 0 ? "improved" : profitChange < 0 ? "declined" : "remained stable"}.`;
  }

  // Prepare chart data
  const chartData = [
    {
      name: "Previous",
      revenue: previousRevenue,
      expenses: previousExpenses,
      profit: previousProfit,
    },
    {
      name: "Current",
      revenue: currentRevenue,
      expenses: currentExpenses,
      profit: currentProfit,
    },
  ];

  // Custom label renderer with dark grey text and background for maximum contrast
  // This ensures labels are readable on both green and red bars
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderBarLabel = (props: any) => {
    const { x = 0, y = 0, width = 0, value } = props;
    if (value === undefined || value === 0 || !width) return null;
    
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
  if (currentRevenue === 0 && previousRevenue === 0 && currentExpenses === 0 && previousExpenses === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue & Expenses</CardTitle>
          <p className="text-xs text-muted-foreground">
            Current vs previous period comparison
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
        <CardTitle className="text-base">Revenue & Expenses</CardTitle>
        <p className="text-xs text-muted-foreground">
          Current vs previous period comparison
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Chart Visualization - Enhanced Bar Chart */}
        <ResponsiveContainer width="100%" height={320}>
          <BarChart 
            data={chartData}
            margin={{ top: 30, right: 20, left: 10, bottom: 10 }}
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
            <Legend 
              wrapperStyle={{ paddingTop: "10px", color: "#1f2937" }}
              iconType="square"
            />
            <Bar 
              dataKey="revenue" 
              fill="#10b981" 
              name="Revenue"
              radius={[6, 6, 0, 0]}
              barSize={50}
            >
              <LabelList dataKey="revenue" content={renderBarLabel} />
            </Bar>
            <Bar 
              dataKey="expenses" 
              fill="#ef4444" 
              name="Expenses"
              radius={[6, 6, 0, 0]}
              barSize={50}
            >
              <LabelList dataKey="expenses" content={renderBarLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Comparison Metrics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-md bg-blue-50 border border-blue-200">
            <div className="flex items-center gap-1 mb-1">
              {revenueDirection === "up" ? (
                <ArrowUp className="h-3 w-3 text-green-600" />
              ) : revenueDirection === "down" ? (
                <ArrowDown className="h-3 w-3 text-red-600" />
              ) : (
                <Minus className="h-3 w-3 text-blue-600" />
              )}
              <span className="font-semibold">Revenue</span>
              <span className="text-muted-foreground">
                {revenueDirection === "up" ? "+" : revenueDirection === "down" ? "-" : ""}
                {revenueChange.toFixed(1)}%
              </span>
            </div>
            <p className="text-muted-foreground">{formatCurrency(currentRevenue)}</p>
          </div>
          <div className="p-2 rounded-md bg-red-50 border border-red-200">
            <div className="flex items-center gap-1 mb-1">
              {expenseDirection === "down" ? (
                <ArrowDown className="h-3 w-3 text-green-600" />
              ) : expenseDirection === "up" ? (
                <ArrowUp className="h-3 w-3 text-red-600" />
              ) : (
                <Minus className="h-3 w-3 text-blue-600" />
              )}
              <span className="font-semibold">Expenses</span>
              <span className="text-muted-foreground">
                {expenseDirection === "up" ? "+" : expenseDirection === "down" ? "-" : ""}
                {expenseChange.toFixed(1)}%
              </span>
            </div>
            <p className="text-muted-foreground">{formatCurrency(currentExpenses)}</p>
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

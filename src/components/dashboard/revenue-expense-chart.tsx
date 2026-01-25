/**
 * Revenue vs Expense Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows revenue and expense trends with period comparison
 * Uses Recharts for proper visualization
 * 
 * Updated to support unified filter contract with time-bucketing
 */

"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";
import type { ChartOutput } from "@/lib/data/dashboard-metrics-types";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";
import { ChipTooltip, type ChipTooltipProps } from "./chip-tooltip";

// New props using ChartOutput format
interface NewProps {
  revenueChart?: ChartOutput;
  expenseChart?: ChartOutput;
  displayCurrency?: string;
}

// Legacy props for backward compatibility
interface LegacyProps {
  currentRevenue: number;
  previousRevenue: number;
  currentExpenses: number;
  previousExpenses: number;
  revenueComparison: PeriodComparison;
  expenseComparison: PeriodComparison;
  displayCurrency?: string;
}

type Props = NewProps | LegacyProps;

function isNewFormat(props: Props): props is NewProps {
  return "revenueChart" in props || "expenseChart" in props;
}

export function RevenueExpenseChart(props: Props) {
  const displayCurrency = props.displayCurrency ?? "AED";
  // Handle new format with time-bucketing
  if (isNewFormat(props) && props.revenueChart && props.expenseChart) {
    const revenueChart = props.revenueChart;
    const expenseChart = props.expenseChart;
    
    // Combine data for line chart
    const currentSeries = revenueChart.series.find(s => s.name === "Current");
    const expenseCurrentSeries = expenseChart.series.find(s => s.name === "Current");
    
    if (!currentSeries || !expenseCurrentSeries) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue & Expenses</CardTitle>
            <p className="text-xs text-muted-foreground">Time-series trend</p>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground text-sm">No data yet</p>
          </CardContent>
        </Card>
      );
    }

    // Prepare chart data with time buckets
    const chartData = currentSeries.points.map((point, idx) => {
      const expensePoint = expenseCurrentSeries.points[idx];
      return {
        label: point.label,
        revenue: point.value,
        expenses: expensePoint?.value || 0,
        profit: point.value - (expensePoint?.value || 0),
      };
    });

    // Add comparison series if available
    const comparisonSeries: Array<{ name: string; data: typeof chartData }> = [];
    revenueChart.series.forEach((series) => {
      if (series.name !== "Current") {
        const expenseSeries = expenseChart.series.find(s => s.name === series.name);
        if (expenseSeries) {
          const compData = series.points.map((point, idx) => {
            const expensePoint = expenseSeries.points[idx];
            return {
              label: point.label,
              revenue: point.value,
              expenses: expensePoint?.value || 0,
              profit: point.value - (expensePoint?.value || 0),
            };
          });
          comparisonSeries.push({ name: series.name, data: compData });
        }
      }
    });

    // Calculate summary
    const currentRevenueTotal = revenueChart.summary.current_total;
    const currentExpenseTotal = expenseChart.summary.current_total;
    const revenueDelta = revenueChart.summary.delta_percent;
    const expenseDelta = expenseChart.summary.delta_percent;

    const revenueDirection = revenueDelta === null ? "stable" : revenueDelta > 0 ? "up" : revenueDelta < 0 ? "down" : "stable";
    const expenseDirection = expenseDelta === null ? "stable" : expenseDelta > 0 ? "up" : expenseDelta < 0 ? "down" : "stable";

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue & Expenses</CardTitle>
          <p className="text-xs text-muted-foreground">
            {revenueChart.bucket === "DAY" ? "Daily" : 
             revenueChart.bucket === "WEEK" ? "Weekly" :
             revenueChart.bucket === "MONTH" ? "Monthly" : "Quarterly"} trend
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Time-series Line Chart */}
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 30, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
              <XAxis 
                dataKey="label" 
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={{ stroke: "#d1d5db" }}
                angle={-45}
                textAnchor="end"
                height={60}
                padding={{ left: 10, right: 10 }}
              />
              <YAxis 
                tickFormatter={(value: number) => formatCurrency(value, displayCurrency)}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={{ stroke: "#d1d5db" }}
                width={80}
              />
              <Tooltip 
                content={(p) => <ChipTooltip {...(p as unknown as ChipTooltipProps)} displayCurrency={displayCurrency} />}
                cursor={{ stroke: "#d1d5db", strokeWidth: 1 }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: "10px", color: "#1f2937" }}
                iconType="line"
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="#10b981" 
                strokeWidth={2}
                name="Revenue"
                dot={{ fill: "#10b981", r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey="expenses" 
                stroke="#ef4444" 
                strokeWidth={2}
                name="Expenses"
                dot={{ fill: "#ef4444", r: 4 }}
                activeDot={{ r: 6 }}
              />
              {/* Add comparison lines for revenue */}
              {comparisonSeries.map((comp, idx) => (
                <Line
                  key={`${comp.name}-revenue`}
                  type="monotone"
                  dataKey="revenue"
                  data={comp.data}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  name={`${comp.name} Revenue`}
                  dot={false}
                  connectNulls
                />
              ))}
              {/* Add comparison lines for expenses */}
              {comparisonSeries.map((comp, idx) => (
                <Line
                  key={`${comp.name}-expenses`}
                  type="monotone"
                  dataKey="expenses"
                  data={comp.data}
                  stroke="#fca5a5"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  name={`${comp.name} Expenses`}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {/* Summary Metrics */}
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
                {revenueDelta !== null && (
                  <span className="text-muted-foreground">
                    {revenueDelta > 0 ? "+" : ""}{revenueDelta.toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="text-muted-foreground">{formatCurrency(currentRevenueTotal, displayCurrency)}</p>
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
                {expenseDelta !== null && (
                  <span className="text-muted-foreground">
                    {expenseDelta > 0 ? "+" : ""}{expenseDelta.toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="text-muted-foreground">{formatCurrency(currentExpenseTotal, displayCurrency)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Legacy format (backward compatibility)
  const {
    currentRevenue,
    previousRevenue,
    currentExpenses,
    previousExpenses,
    revenueComparison,
    expenseComparison,
  } = props as LegacyProps;

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

  // Custom label renderer
  interface LabelRendererProps {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    value?: number | string;
    [key: string]: unknown;
  }
  const renderBarLabel = (props: LabelRendererProps) => {
    const x = typeof props.x === "string" ? parseFloat(props.x) || 0 : props.x || 0;
    const y = typeof props.y === "string" ? parseFloat(props.y) || 0 : props.y || 0;
    const width = typeof props.width === "string" ? parseFloat(props.width) || 0 : props.width || 0;
    const value = typeof props.value === "string" ? parseFloat(props.value) || 0 : props.value || 0;
    if (value === undefined || value === 0 || !width) return null;
    
    const textX = x + width / 2;
    const textY = y - 8;
    const textValue = formatCurrency(value, displayCurrency);
    
    return (
      <g>
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

  // Empty state handling - show zeros with note instead of blank
  if (currentRevenue === 0 && previousRevenue === 0 && currentExpenses === 0 && previousExpenses === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue & Expenses</CardTitle>
          <p className="text-xs text-muted-foreground">
            Current vs previous period comparison
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart 
              data={[{ name: "Current", revenue: 0, expenses: 0 }]}
              margin={{ top: 30, right: 20, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
              <XAxis 
                dataKey="name" 
                tick={{ fill: "#6b7280", fontSize: 12 }}
                axisLine={{ stroke: "#d1d5db" }}
              />
              <YAxis 
                tickFormatter={(value: number) => formatCurrency(value, displayCurrency)}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={{ stroke: "#d1d5db" }}
                width={80}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <div className="p-2 bg-white border rounded shadow text-xs">
                      No data yet
                    </div>
                  );
                }}
              />
              <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
              <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-center text-muted-foreground">No data yet</p>
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
              tickFormatter={(value: number) => formatCurrency(value, displayCurrency)}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              axisLine={{ stroke: "#d1d5db" }}
              width={80}
            />
            <Tooltip 
              content={(p) => <ChipTooltip {...(p as unknown as ChipTooltipProps)} displayCurrency={displayCurrency} />}
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
              <LabelList dataKey="revenue" content={renderBarLabel as (props: unknown) => React.ReactNode} />
            </Bar>
            <Bar 
              dataKey="expenses" 
              fill="#ef4444" 
              name="Expenses"
              radius={[6, 6, 0, 0]}
              barSize={50}
            >
              <LabelList dataKey="expenses" content={renderBarLabel as (props: unknown) => React.ReactNode} />
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
            <p className="text-muted-foreground">{formatCurrency(currentRevenue, displayCurrency)}</p>
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
            <p className="text-muted-foreground">{formatCurrency(currentExpenses, displayCurrency)}</p>
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

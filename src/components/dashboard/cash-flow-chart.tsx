/**
 * Cash Flow Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows cash flow trend with period comparison
 * Updated to support unified filter contract with time-bucketing
 */

"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";
import type { ChartOutput } from "@/lib/data/dashboard-metrics-types";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { ChipTooltip, type ChipTooltipProps } from "./chip-tooltip";

// New props using ChartOutput format
interface NewProps {
  cashFlowChart?: ChartOutput;
  displayCurrency?: string;
}

// Legacy props for backward compatibility
interface LegacyProps {
  currentCashFlow: number;
  previousCashFlow: number;
  comparison: PeriodComparison;
  displayCurrency?: string;
}

type Props = NewProps | LegacyProps;

function isNewFormat(props: Props): props is NewProps {
  return "cashFlowChart" in props;
}

export function CashFlowChart(props: Props) {
  const displayCurrency = props.displayCurrency ?? "AED";
  // Handle new format with time-bucketing
  if (isNewFormat(props) && props.cashFlowChart) {
    const chart = props.cashFlowChart;
    const currentSeries = chart.series.find(s => s.name === "Current");
    
    if (!currentSeries || currentSeries.points.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash Flow Trend</CardTitle>
            <p className="text-xs text-muted-foreground">Time-series trend</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={[{ label: "No data", value: 0 }]} margin={{ top: 30, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 12 }} />
                <YAxis tickFormatter={(value: number) => formatCurrency(value, displayCurrency)} tick={{ fill: "#6b7280", fontSize: 11 }} width={80} />
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
                <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-center text-muted-foreground">No data yet</p>
          </CardContent>
        </Card>
      );
    }

    // Prepare chart data with time buckets
    const chartData = currentSeries.points.map(point => ({
      label: point.label,
      value: point.value,
    }));

    // Add comparison series
    const comparisonSeries = chart.series.filter(s => s.name !== "Current");

    // Calculate summary
    const currentTotal = chart.summary.current_total;
    const compareTotal = chart.summary.compare_total;
    const deltaPercent = chart.summary.delta_percent;
    const deltaAmount = chart.summary.delta_amount;

    const direction = deltaPercent === null ? "stable" : deltaPercent > 0 ? "up" : deltaPercent < 0 ? "down" : "stable";
    const absPercentage = deltaPercent ? Math.abs(deltaPercent) : 0;
    const absDifference = deltaAmount ? Math.abs(deltaAmount) : 0;

    const directionConfig = {
      up: {
        icon: ArrowUp,
        color: "text-green-600",
        bgColor: "bg-green-50",
        borderColor: "border-green-200",
        interpretation: `Cash flow improved by ${absPercentage.toFixed(1)}% this period (${formatCurrency(absDifference, displayCurrency)} more). This indicates healthier cash generation from operations.`,
      },
      down: {
        icon: ArrowDown,
        color: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
        interpretation: `Cash flow declined by ${absPercentage.toFixed(1)}% this period (${formatCurrency(absDifference, displayCurrency)} less). Monitor collections and payment timing.`,
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

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash Flow Trend</CardTitle>
          <p className="text-xs text-muted-foreground">
            {chart.bucket === "DAY" ? "Daily" : 
             chart.bucket === "WEEK" ? "Weekly" :
             chart.bucket === "MONTH" ? "Monthly" : "Quarterly"} trend
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
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#6366f1" 
                strokeWidth={2}
                name="Cash Flow"
                dot={{ fill: "#6366f1", r: 4 }}
                activeDot={{ r: 6 }}
              />
              {/* Add comparison lines */}
              {comparisonSeries.map((comp, idx) => (
                <Line
                  key={comp.name}
                  type="monotone"
                  dataKey="value"
                  data={comp.points.map(p => ({ label: p.label, value: p.value }))}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  name={comp.name}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {/* Summary Metrics */}
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
              {deltaAmount !== null && (
                <span className="text-xs text-muted-foreground">
                  ({direction === "up" ? "+" : direction === "down" ? "-" : ""}
                  {formatCurrency(absDifference, displayCurrency)})
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

  // Legacy format (backward compatibility)
  const {
    currentCashFlow,
    previousCashFlow,
    comparison,
  } = props as LegacyProps;

  const { direction, percentageChange, difference } = comparison;
  const absPercentage = Math.abs(percentageChange);
  const absDifference = Math.abs(difference);

  const directionConfig = {
    up: {
      icon: ArrowUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      interpretation: `Cash flow improved by ${absPercentage.toFixed(1)}% this period (${formatCurrency(absDifference, displayCurrency)} more). This indicates healthier cash generation from operations.`,
    },
    down: {
      icon: ArrowDown,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      interpretation: `Cash flow declined by ${absPercentage.toFixed(1)}% this period (${formatCurrency(absDifference, displayCurrency)} less). Monitor collections and payment timing.`,
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
    if (value === undefined || Math.abs(value || 0) < 0.01 || !width) return null;
    
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
  if (currentCashFlow === 0 && previousCashFlow === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cash Flow Trend</CardTitle>
          <p className="text-xs text-muted-foreground">
            Current vs previous period
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart 
              data={[{ name: "Current", value: 0 }]}
              margin={{ top: 30, right: 10, left: 10, bottom: 10 }}
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
                content={<div className="p-2 bg-white border rounded shadow text-xs">No data yet</div>} 
              />
              <Bar dataKey="value" fill="#6366f1" />
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
              tickFormatter={(value: number) => formatCurrency(value, displayCurrency)}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              axisLine={{ stroke: "#d1d5db" }}
              width={80}
            />
            <Tooltip 
              content={(p) => <ChipTooltip {...(p as unknown as ChipTooltipProps)} displayCurrency={displayCurrency} />}
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
              <LabelList dataKey="value" content={renderBarLabel as (props: unknown) => React.ReactNode} />
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
              {formatCurrency(absDifference, displayCurrency)})
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

/**
 * Profitability Trend Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows net income margin trends with period comparison
 * Updated to support unified filter contract with time-bucketing
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";
import type { ChartOutput } from "@/lib/data/dashboard-metrics-types";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ChipTooltip, type ChipTooltipProps } from "./chip-tooltip";

// New props using ChartOutput format
interface NewProps {
  profitabilityChart?: ChartOutput;
  revenueChart?: ChartOutput; // Needed to calculate margins
  displayCurrency?: string;
}

// Legacy props for backward compatibility
interface LegacyProps {
  currentRevenue: number;
  previousRevenue: number;
  currentNetIncome: number;
  previousNetIncome: number;
  netIncomeComparison: PeriodComparison;
  displayCurrency?: string;
}

type Props = NewProps | LegacyProps;

function isNewFormat(props: Props): props is NewProps {
  return "profitabilityChart" in props || "revenueChart" in props;
}

export function ProfitabilityChart(props: Props) {
  const displayCurrency = props.displayCurrency ?? "AED";
  // Handle new format with time-bucketing
  if (isNewFormat(props) && props.profitabilityChart && props.revenueChart) {
    const profitChart = props.profitabilityChart;
    const revenueChart = props.revenueChart;
    
    const currentSeries = profitChart.series.find(s => s.name === "Current");
    const revenueCurrentSeries = revenueChart.series.find(s => s.name === "Current");
    
    if (!currentSeries || !revenueCurrentSeries || currentSeries.points.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profitability Trend</CardTitle>
            <p className="text-xs text-muted-foreground">Time-series trend</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={[{ label: "No data", netIncome: 0, margin: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(value: number) => formatCurrency(value, displayCurrency)} />
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
                <Line type="monotone" dataKey="netIncome" stroke="#3b82f6" />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-center text-muted-foreground">No data yet</p>
          </CardContent>
        </Card>
      );
    }

    // Prepare chart data with time buckets and margins
    const chartData = currentSeries.points.map((point, idx) => {
      const revenuePoint = revenueCurrentSeries.points[idx];
      const revenue = revenuePoint?.value || 0;
      const netIncome = point.value;
      const margin = revenue !== 0 ? (netIncome / revenue) * 100 : 0;
      return {
        label: point.label,
        netIncome,
        margin,
        revenue,
      };
    });

    // Add comparison series
    const comparisonSeries = profitChart.series.filter(s => s.name !== "Current");
    const revenueComparisonSeries = revenueChart.series.filter(s => s.name !== "Current");

    // Calculate summary
    const currentTotal = profitChart.summary.current_total;
    const revenueTotal = revenueChart.summary.current_total;
    const currentMargin = revenueTotal !== 0 ? (currentTotal / revenueTotal) * 100 : 0;
    
    const compareTotal = profitChart.summary.compare_total;
    const revenueCompareTotal = revenueChart.summary.compare_total;
    const previousMargin = revenueCompareTotal !== null && revenueCompareTotal !== 0
      ? ((compareTotal || 0) / revenueCompareTotal) * 100
      : 0;

    const deltaPercent = profitChart.summary.delta_percent;
    const direction = deltaPercent === null ? "stable" : deltaPercent > 0 ? "up" : deltaPercent < 0 ? "down" : "stable";
    const absPercentage = deltaPercent ? Math.abs(deltaPercent) : 0;
    const absDifference = profitChart.summary.delta_amount ? Math.abs(profitChart.summary.delta_amount) : 0;
    const marginChange = currentMargin - previousMargin;

    const directionConfig = {
      up: {
        icon: ArrowUp,
        color: "text-green-600",
        bgColor: "bg-green-50",
        borderColor: "border-green-200",
        interpretation: `Profitability improved by ${absPercentage.toFixed(1)}% (${formatCurrency(absDifference, displayCurrency)} more net income). Margin increased from ${previousMargin.toFixed(1)}% to ${currentMargin.toFixed(1)}%. Business efficiency is improving.`,
      },
      down: {
        icon: ArrowDown,
        color: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
        interpretation: `Profitability declined by ${absPercentage.toFixed(1)}% (${formatCurrency(absDifference, displayCurrency)} less net income). Margin decreased from ${previousMargin.toFixed(1)}% to ${currentMargin.toFixed(1)}%. Review cost structure and pricing.`,
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

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profitability Trend</CardTitle>
          <p className="text-xs text-muted-foreground">
            {profitChart.bucket === "DAY" ? "Daily" : 
             profitChart.bucket === "WEEK" ? "Weekly" :
             profitChart.bucket === "MONTH" ? "Monthly" : "Quarterly"} net income and margin
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Time-series Line Chart */}
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
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
                yAxisId="left"
                tickFormatter={(value: number) => formatCurrency(value, displayCurrency)}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={{ stroke: "#d1d5db" }}
                label={{ value: "Net Income", angle: -90, position: "insideLeft", style: { textAnchor: "middle" } }}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                tickFormatter={(value: number) => `${value}%`}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={{ stroke: "#d1d5db" }}
                label={{ value: "Margin %", angle: 90, position: "insideRight", style: { textAnchor: "middle" } }}
              />
              <Tooltip content={(p) => <ChipTooltip {...(p as unknown as ChipTooltipProps)} displayCurrency={displayCurrency} />} />
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
                dot={{ fill: "#3b82f6", r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="margin" 
                stroke="#10b981" 
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Margin %"
                dot={{ fill: "#10b981", r: 4 }}
                activeDot={{ r: 6 }}
              />
              {/* Add comparison lines */}
              {comparisonSeries.map((comp, idx) => {
                const revenueComp = revenueComparisonSeries[idx];
                if (!revenueComp) return null;
                const compData = comp.points.map((point, pIdx) => {
                  const revenuePoint = revenueComp.points[pIdx];
                  const revenue = revenuePoint?.value || 0;
                  const netIncome = point.value;
                  const margin = revenue !== 0 ? (netIncome / revenue) * 100 : 0;
                  return {
                    label: chartData[pIdx]?.label || point.label,
                    netIncome,
                    margin,
                  };
                });
                return (
                  <Line
                    key={`comp-${comp.name}`}
                    yAxisId="left"
                    type="monotone"
                    dataKey="netIncome"
                    data={compData}
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    name={`${comp.name} Net Income`}
                    dot={false}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>

          {/* Summary Metrics */}
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
              {profitChart.summary.delta_amount !== null && (
                <span className="text-xs text-muted-foreground">
                  ({direction === "up" ? "+" : direction === "down" ? "-" : ""}
                  {formatCurrency(absDifference, displayCurrency)})
                </span>
              )}
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

  // Legacy format (backward compatibility)
  const {
    currentRevenue,
    previousRevenue,
    currentNetIncome,
    previousNetIncome,
    netIncomeComparison,
  } = props as LegacyProps;

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
      interpretation: `Profitability improved by ${absPercentage.toFixed(1)}% (${formatCurrency(absDifference, displayCurrency)} more net income). Margin increased from ${previousMargin.toFixed(1)}% to ${currentMargin.toFixed(1)}%. Business efficiency is improving.`,
    },
    down: {
      icon: ArrowDown,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      interpretation: `Profitability declined by ${absPercentage.toFixed(1)}% (${formatCurrency(absDifference, displayCurrency)} less net income). Margin decreased from ${previousMargin.toFixed(1)}% to ${currentMargin.toFixed(1)}%. Review cost structure and pricing.`,
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

  // Empty state handling - show zeros with note instead of blank
  if (currentRevenue === 0 && previousRevenue === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profitability Trend</CardTitle>
          <p className="text-xs text-muted-foreground">
            Net income margin comparison
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={[{ period: "Current", netIncome: 0, margin: 0 }]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={(value: number) => formatCurrency(value, displayCurrency)} />
              <Tooltip content={<div className="p-2 bg-white border rounded shadow text-xs">No data yet</div>} />
              <Line type="monotone" dataKey="netIncome" stroke="#3b82f6" />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-center text-muted-foreground">No data yet</p>
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
              tickFormatter={(value: number) => formatCurrency(value, displayCurrency)}
              label={{ value: "Net Income", angle: -90, position: "insideLeft" }}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              tickFormatter={(value: number) => `${value}%`}
              label={{ value: "Margin %", angle: 90, position: "insideRight" }}
            />
            <Tooltip 
              content={(p) => <ChipTooltip {...(p as unknown as ChipTooltipProps)} displayCurrency={displayCurrency} />}
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
              {formatCurrency(absDifference, displayCurrency)})
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

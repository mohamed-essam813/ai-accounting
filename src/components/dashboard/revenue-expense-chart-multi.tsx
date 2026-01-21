/**
 * Multi-Period Revenue vs Expense Chart
 * 
 * Shows revenue and expense trends across multiple periods
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";
import type { MultiPeriodData } from "@/lib/data/multi-period-comparison";
import { ChipTooltip } from "./chip-tooltip";

interface Props {
  multiPeriodData: MultiPeriodData;
}

export function RevenueExpenseChartMulti({ multiPeriodData }: Props) {
  // Prepare chart data from multiple periods
  const chartData = multiPeriodData.periods.map((period) => ({
    name: period.label,
    revenue: period.data.revenue,
    expenses: period.data.expenses,
    profit: period.data.revenue - period.data.expenses,
  }));

  // Custom label renderer with dark grey text and background for maximum contrast
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
            fontSize: "10px",
            fontWeight: "600",
            letterSpacing: "0.2px",
          }}
        >
          {textValue}
        </text>
      </g>
    );
  };

  // Calculate trends
  const firstPeriod = multiPeriodData.periods[0];
  const lastPeriod = multiPeriodData.periods[multiPeriodData.periods.length - 1];
  const revenueChange = firstPeriod.data.revenue !== 0
    ? ((lastPeriod.data.revenue - firstPeriod.data.revenue) / Math.abs(firstPeriod.data.revenue)) * 100
    : 0;
  const expenseChange = firstPeriod.data.expenses !== 0
    ? ((lastPeriod.data.expenses - firstPeriod.data.expenses) / Math.abs(firstPeriod.data.expenses)) * 100
    : 0;

  // Empty state handling
  const hasData = chartData.some((d) => d.revenue > 0 || d.expenses > 0);
  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue & Expenses</CardTitle>
          <p className="text-xs text-muted-foreground">
            Multi-period trend analysis
          </p>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No data available for selected periods</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue & Expenses</CardTitle>
        <p className="text-xs text-muted-foreground">
          Trend across {multiPeriodData.periods.length} periods
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Chart Visualization */}
        <ResponsiveContainer width="100%" height={320}>
          <BarChart 
            data={chartData}
            margin={{ top: 30, right: 20, left: 10, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
            <XAxis 
              dataKey="name" 
              angle={-45}
              textAnchor="end"
              height={60}
              tick={{ fill: "#6b7280", fontSize: 11 }}
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
              wrapperStyle={{ paddingTop: "10px" }}
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

        {/* Trend Summary */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-md bg-blue-50 border border-blue-200">
            <div className="flex items-center gap-1 mb-1">
              <span className="font-semibold">Revenue Trend</span>
              <span className={`text-muted-foreground ${revenueChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                {revenueChange >= 0 ? "+" : ""}{revenueChange.toFixed(1)}%
              </span>
            </div>
            <p className="text-muted-foreground">
              {formatCurrency(firstPeriod.data.revenue)} → {formatCurrency(lastPeriod.data.revenue)}
            </p>
          </div>
          <div className="p-2 rounded-md bg-red-50 border border-red-200">
            <div className="flex items-center gap-1 mb-1">
              <span className="font-semibold">Expense Trend</span>
              <span className={`text-muted-foreground ${expenseChange <= 0 ? "text-green-600" : "text-red-600"}`}>
                {expenseChange >= 0 ? "+" : ""}{expenseChange.toFixed(1)}%
              </span>
            </div>
            <p className="text-muted-foreground">
              {formatCurrency(firstPeriod.data.expenses)} → {formatCurrency(lastPeriod.data.expenses)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

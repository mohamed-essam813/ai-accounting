/**
 * Revenue vs Expense Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows revenue and expense trends with period comparison
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";

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

  // Chart visualization
  const maxValue = Math.max(currentRevenue, previousRevenue, currentExpenses, previousExpenses, 1);
  const currentRevenueHeight = (currentRevenue / maxValue) * 100;
  const previousRevenueHeight = (previousRevenue / maxValue) * 100;
  const currentExpenseHeight = (currentExpenses / maxValue) * 100;
  const previousExpenseHeight = (previousExpenses / maxValue) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue vs Expenses</CardTitle>
        <p className="text-xs text-muted-foreground">
          Current vs previous period comparison
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Chart Visualization */}
        <div className="space-y-3">
          <div className="flex items-end gap-6 h-40">
            {/* Previous Period */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex flex-col items-center justify-end h-full gap-2">
                <div className="w-full flex flex-col items-end gap-1">
                  <div
                    className="w-full bg-blue-300 rounded-t-md transition-all shadow-sm hover:shadow-md"
                    style={{ height: `${Math.max(previousRevenueHeight, 5)}%` }}
                    title={`Previous Revenue: ${formatCurrency(previousRevenue)}`}
                  />
                  <div
                    className="w-full bg-red-300 rounded-t-md transition-all shadow-sm hover:shadow-md"
                    style={{ height: `${Math.max(previousExpenseHeight, 5)}%` }}
                    title={`Previous Expenses: ${formatCurrency(previousExpenses)}`}
                  />
                </div>
              </div>
              <div className="text-center mt-2">
                <p className="text-xs font-medium text-muted-foreground">Previous</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatCurrency(previousRevenue - previousExpenses)}
                </p>
              </div>
            </div>

            {/* Current Period */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex flex-col items-center justify-end h-full gap-2">
                <div className="w-full flex flex-col items-end gap-1">
                  <div
                    className={`w-full rounded-t-md transition-all shadow-md hover:shadow-lg border-2 ${
                      revenueDirection === "up"
                        ? "bg-green-500 border-green-400"
                        : revenueDirection === "down"
                          ? "bg-red-500 border-red-400"
                          : "bg-blue-500 border-blue-400"
                    }`}
                    style={{ height: `${Math.max(currentRevenueHeight, 5)}%` }}
                    title={`Current Revenue: ${formatCurrency(currentRevenue)}`}
                  />
                  <div
                    className={`w-full rounded-t-md transition-all shadow-md hover:shadow-lg border-2 ${
                      expenseDirection === "down"
                        ? "bg-green-400 border-green-300"
                        : expenseDirection === "up"
                          ? "bg-red-500 border-red-400"
                          : "bg-orange-400 border-orange-300"
                    }`}
                    style={{ height: `${Math.max(currentExpenseHeight, 5)}%` }}
                    title={`Current Expenses: ${formatCurrency(currentExpenses)}`}
                  />
                </div>
              </div>
              <div className="text-center mt-2">
                <p className="text-xs font-semibold">Current</p>
                <p className="text-xs font-medium text-foreground mt-0.5">
                  {formatCurrency(currentRevenue - currentExpenses)}
                </p>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-400 rounded" />
              <span>Revenue</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-400 rounded" />
              <span>Expenses</span>
            </div>
          </div>

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
        </div>
      </CardContent>
    </Card>
  );
}


/**
 * AR/AP Ageing Trend Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows receivables and payables outstanding trends with period comparison
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";

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

  // Chart visualization
  const maxValue = Math.max(currentAR, previousAR, currentAP, previousAP, 1);
  const currentARHeight = (currentAR / maxValue) * 100;
  const previousARHeight = (previousAR / maxValue) * 100;
  const currentAPHeight = (currentAP / maxValue) * 100;
  const previousAPHeight = (previousAP / maxValue) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AR/AP Ageing Trend</CardTitle>
        <p className="text-xs text-muted-foreground">
          Receivables vs Payables outstanding
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
                    style={{ height: `${Math.max(previousARHeight, 5)}%` }}
                    title={`Previous AR: ${formatCurrency(previousAR)}`}
                  />
                  <div
                    className="w-full bg-orange-300 rounded-t-md transition-all shadow-sm hover:shadow-md"
                    style={{ height: `${Math.max(previousAPHeight, 5)}%` }}
                    title={`Previous AP: ${formatCurrency(previousAP)}`}
                  />
                </div>
              </div>
              <div className="text-center mt-2">
                <p className="text-xs font-medium text-muted-foreground">Previous</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Net: {formatCurrency(previousAR - previousAP)}
                </p>
              </div>
            </div>

            {/* Current Period */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex flex-col items-center justify-end h-full gap-2">
                <div className="w-full flex flex-col items-end gap-1">
                  <div
                    className={`w-full rounded-t-md transition-all shadow-md hover:shadow-lg border-2 ${
                      arDirection === "down"
                        ? "bg-green-500 border-green-400"
                        : arDirection === "up"
                          ? "bg-red-500 border-red-400"
                          : "bg-blue-500 border-blue-400"
                    }`}
                    style={{ height: `${Math.max(currentARHeight, 5)}%` }}
                    title={`Current AR: ${formatCurrency(currentAR)}`}
                  />
                  <div
                    className={`w-full rounded-t-md transition-all shadow-md hover:shadow-lg border-2 ${
                      apDirection === "down"
                        ? "bg-green-400 border-green-300"
                        : apDirection === "up"
                          ? "bg-orange-500 border-orange-400"
                          : "bg-orange-400 border-orange-300"
                    }`}
                    style={{ height: `${Math.max(currentAPHeight, 5)}%` }}
                    title={`Current AP: ${formatCurrency(currentAP)}`}
                  />
                </div>
              </div>
              <div className="text-center mt-2">
                <p className="text-xs font-semibold">Current</p>
                <p className="text-xs font-medium text-foreground mt-0.5">
                  Net: {formatCurrency(currentAR - currentAP)}
                </p>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-400 rounded" />
              <span>AR (Receivables)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-orange-400 rounded" />
              <span>AP (Payables)</span>
            </div>
          </div>

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
        </div>
      </CardContent>
    </Card>
  );
}


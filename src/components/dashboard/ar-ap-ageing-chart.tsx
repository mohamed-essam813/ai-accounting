/**
 * AR/AP Ageing Chart for Dashboard
 * Excel Elimination Doctrine: Charts must answer business questions with context
 * 
 * Shows receivables and payables outstanding with ageing buckets
 * Uses as-of-date snapshots (not period sums)
 * Updated to support unified filter contract
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { PeriodComparison } from "@/lib/utils/period-comparison";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChipTooltip, type ChipTooltipProps } from "./chip-tooltip";

// New props using ageing data format
interface NewProps {
  displayCurrency?: string;
  ageingData?: {
    ar: {
      current: { total: number; bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90_plus: number };
      comparison: { total: number; bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90_plus: number } | null;
    };
    ap: {
      current: { total: number; bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90_plus: number };
      comparison: { total: number; bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90_plus: number } | null;
    };
  };
}

// Legacy props for backward compatibility
interface LegacyProps {
  currentAR: number;
  previousAR: number;
  currentAP: number;
  previousAP: number;
  arComparison: PeriodComparison;
  apComparison: PeriodComparison;
  displayCurrency?: string;
}

type Props = NewProps | LegacyProps;

function isNewFormat(props: Props): props is NewProps {
  return "ageingData" in props;
}

export function ARAPAgeingChart(props: Props) {
  const displayCurrency = props.displayCurrency ?? "AED";
  // Handle new format with ageing buckets
  if (isNewFormat(props) && props.ageingData) {
    const { ar, ap } = props.ageingData;
    
    // Prepare chart data with ageing buckets
    const chartData = [
      {
        period: "Current",
        ar_0_30: ar.current.bucket_0_30,
        ar_31_60: ar.current.bucket_31_60,
        ar_61_90: ar.current.bucket_61_90,
        ar_90_plus: ar.current.bucket_90_plus,
        ap_0_30: ap.current.bucket_0_30,
        ap_31_60: ap.current.bucket_31_60,
        ap_61_90: ap.current.bucket_61_90,
        ap_90_plus: ap.current.bucket_90_plus,
        ar_total: ar.current.total,
        ap_total: ap.current.total,
      },
    ];

    // Add comparison if available
    if (ar.comparison && ap.comparison) {
      chartData.push({
        period: "Previous",
        ar_0_30: ar.comparison.bucket_0_30,
        ar_31_60: ar.comparison.bucket_31_60,
        ar_61_90: ar.comparison.bucket_61_90,
        ar_90_plus: ar.comparison.bucket_90_plus,
        ap_0_30: ap.comparison.bucket_0_30,
        ap_31_60: ap.comparison.bucket_31_60,
        ap_61_90: ap.comparison.bucket_61_90,
        ap_90_plus: ap.comparison.bucket_90_plus,
        ar_total: ar.comparison.total,
        ap_total: ap.comparison.total,
      });
    }

    // Calculate changes
    const arChange = ar.comparison 
      ? ((ar.current.total - ar.comparison.total) / (ar.comparison.total || 1)) * 100
      : 0;
    const apChange = ap.comparison
      ? ((ap.current.total - ap.comparison.total) / (ap.comparison.total || 1)) * 100
      : 0;

    const arDirection = arChange > 1 ? "up" : arChange < -1 ? "down" : "stable";
    const apDirection = apChange > 1 ? "up" : apChange < -1 ? "down" : "stable";

    // Calculate overdue percentages
    const arOverdue = ar.current.bucket_31_60 + ar.current.bucket_61_90 + ar.current.bucket_90_plus;
    const arOverduePercent = ar.current.total > 0 ? (arOverdue / ar.current.total) * 100 : 0;

    // Empty state handling - show zeros with note instead of blank
    if (ar.current.total === 0 && ap.current.total === 0 && (!ar.comparison || ar.comparison.total === 0) && (!ap.comparison || ap.comparison.total === 0)) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AR/AP Ageing</CardTitle>
            <p className="text-xs text-muted-foreground">Outstanding receivables and payables by ageing bucket</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={[{ period: "Current", ar_total: 0, ap_total: 0 }]} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                <XAxis type="number" tickFormatter={(value: number) => formatCurrency(value, displayCurrency)} tick={{ fill: "#6b7280", fontSize: 11 }} />
                <YAxis dataKey="period" type="category" width={90} tick={{ fill: "#6b7280", fontSize: 12 }} />
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
                <Bar dataKey="ar_total" fill="#10b981" name="AR" />
                <Bar dataKey="ap_total" fill="#ef4444" name="AP" />
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
          <CardTitle className="text-base">AR/AP Ageing</CardTitle>
          <p className="text-xs text-muted-foreground">
            Outstanding receivables and payables by ageing bucket (as-of period end)
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Horizontal Stacked Bar Chart for AR */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Accounts Receivable</h4>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                <XAxis 
                  type="number" 
                  tickFormatter={(value: number) => formatCurrency(value, displayCurrency)}
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
                <Tooltip content={(p) => <ChipTooltip {...(p as unknown as ChipTooltipProps)} displayCurrency={displayCurrency} />} />
                <Legend wrapperStyle={{ paddingTop: "5px", fontSize: "11px" }} />
                <Bar dataKey="ar_0_30" stackId="ar" fill="#10b981" name="0-30 days" />
                <Bar dataKey="ar_31_60" stackId="ar" fill="#f59e0b" name="31-60 days" />
                <Bar dataKey="ar_61_90" stackId="ar" fill="#f97316" name="61-90 days" />
                <Bar dataKey="ar_90_plus" stackId="ar" fill="#ef4444" name="90+ days" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Horizontal Stacked Bar Chart for AP */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Accounts Payable</h4>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                <XAxis 
                  type="number" 
                  tickFormatter={(value: number) => formatCurrency(value, displayCurrency)}
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
                <Tooltip content={(p) => <ChipTooltip {...(p as unknown as ChipTooltipProps)} displayCurrency={displayCurrency} />} />
                <Legend wrapperStyle={{ paddingTop: "5px", fontSize: "11px" }} />
                <Bar dataKey="ap_0_30" stackId="ap" fill="#10b981" name="0-30 days" />
                <Bar dataKey="ap_31_60" stackId="ap" fill="#f59e0b" name="31-60 days" />
                <Bar dataKey="ap_61_90" stackId="ap" fill="#f97316" name="61-90 days" />
                <Bar dataKey="ap_90_plus" stackId="ap" fill="#ef4444" name="90+ days" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Metrics */}
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
                <span className="font-semibold">AR Total</span>
                {ar.comparison && (
                  <span className="text-muted-foreground">
                    {arDirection === "down" ? "-" : arDirection === "up" ? "+" : ""}
                    {Math.abs(arChange).toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="text-muted-foreground">{formatCurrency(ar.current.total, displayCurrency)}</p>
              {arOverduePercent > 0 && (
                <p className="text-xs text-red-600 mt-1">
                  {arOverduePercent.toFixed(1)}% overdue
                </p>
              )}
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
                <span className="font-semibold">AP Total</span>
                {ap.comparison && (
                  <span className="text-muted-foreground">
                    {apDirection === "up" ? "+" : apDirection === "down" ? "-" : ""}
                    {Math.abs(apChange).toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="text-muted-foreground">{formatCurrency(ap.current.total, displayCurrency)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Legacy format (backward compatibility)
  const {
    currentAR,
    previousAR,
    currentAP,
    previousAP,
    arComparison,
    apComparison,
  } = props as LegacyProps;

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
    interpretation = `Working capital ${trend} by ${formatCurrency(Math.abs(netWCChange), displayCurrency)}. ${arDirection === "stable" && apDirection === "stable" ? "Both AR and AP are stable." : "Monitor collection and payment cycles."}`;
  }

  // Chart data for horizontal grouped bars
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

  // Empty state handling - show zeros with note instead of blank
  if (currentAR === 0 && previousAR === 0 && currentAP === 0 && previousAP === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AR/AP Ageing Trend</CardTitle>
          <p className="text-xs text-muted-foreground">
            Receivables vs Payables outstanding
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart 
              data={[{ period: "Current", ar: 0, ap: 0 }]} 
              layout="vertical"
              margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
              <XAxis type="number" tickFormatter={(value: number) => formatCurrency(value, displayCurrency)} tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis dataKey="period" type="category" width={90} tick={{ fill: "#6b7280", fontSize: 12 }} />
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
              <Bar dataKey="ar" fill="#10b981" name="Accounts Receivable" />
              <Bar dataKey="ap" fill="#ef4444" name="Accounts Payable" />
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
        <CardTitle className="text-base">AR/AP Ageing Trend</CardTitle>
        <p className="text-xs text-muted-foreground">
          Receivables vs Payables outstanding
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Horizontal Grouped Bar Chart */}
        <ResponsiveContainer width="100%" height={320}>
          <BarChart 
            data={chartData} 
            layout="vertical"
            margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
            <XAxis 
              type="number" 
              tickFormatter={(value: number) => formatCurrency(value, displayCurrency)}
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
                content={(p) => <ChipTooltip {...(p as unknown as ChipTooltipProps)} displayCurrency={displayCurrency} />}
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
            <p className="text-muted-foreground">{formatCurrency(currentAR, displayCurrency)}</p>
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
            <p className="text-muted-foreground">{formatCurrency(currentAP, displayCurrency)}</p>
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

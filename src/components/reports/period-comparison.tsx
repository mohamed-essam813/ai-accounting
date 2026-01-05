/**
 * Period Comparison Component
 * Excel Elimination Doctrine: Native Comparisons
 * 
 * Shows current vs previous period with differences and percentages
 */

import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { PeriodComparison } from "@/lib/utils/period-comparison";

interface Props {
  comparison: PeriodComparison;
  label: string;
  showLabel?: boolean;
}

export function PeriodComparisonDisplay({ comparison, label, showLabel = true }: Props) {
  const { current, previous, difference, percentageChange, direction } = comparison;

  const directionConfig = {
    up: {
      icon: ArrowUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
    },
    down: {
      icon: ArrowDown,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
    },
    stable: {
      icon: Minus,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
    },
  };

  const config = directionConfig[direction];
  const Icon = config.icon;
  const absPercentage = Math.abs(percentageChange);
  const absDifference = Math.abs(difference);

  return (
    <div className="space-y-2">
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">vs Previous Period</span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        {/* Current Period */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Current</p>
          <p className="text-lg font-semibold">{formatCurrency(current)}</p>
        </div>

        {/* Previous Period */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Previous</p>
          <p className="text-lg font-medium text-muted-foreground">
            {formatCurrency(previous)}
          </p>
        </div>

        {/* Change */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Change</p>
          <div className="flex items-center gap-1.5">
            <Icon className={`h-4 w-4 ${config.color}`} />
            <div>
              <p className={`text-lg font-semibold ${config.color}`}>
                {direction === "up" ? "+" : direction === "down" ? "-" : ""}
                {formatCurrency(absDifference)}
              </p>
              <p className={`text-xs ${config.color}`}>
                {direction === "stable"
                  ? "No change"
                  : `${absPercentage.toFixed(1)}% ${direction === "up" ? "increase" : "decrease"}`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact period comparison for inline display
 */
export function PeriodComparisonInline({ comparison, label }: Props) {
  const { current, previous, difference, percentageChange, direction } = comparison;

  const directionConfig = {
    up: { icon: ArrowUp, color: "text-green-600" },
    down: { icon: ArrowDown, color: "text-red-600" },
    stable: { icon: Minus, color: "text-blue-600" },
  };

  const config = directionConfig[direction];
  const Icon = config.icon;
  const absPercentage = Math.abs(percentageChange);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium">{label}:</span>
      <span className="font-semibold">{formatCurrency(current)}</span>
      {direction !== "stable" && (
        <>
          <span className="text-muted-foreground">vs</span>
          <span className="text-muted-foreground">{formatCurrency(previous)}</span>
          <Icon className={`h-3 w-3 ${config.color}`} />
          <span className={config.color}>
            {absPercentage.toFixed(1)}% {direction === "up" ? "↑" : "↓"}
          </span>
        </>
      )}
    </div>
  );
}


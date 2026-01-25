/**
 * Chip-Style Tooltip Component for Charts
 * Professional, modern tooltip with individual chips for each data point
 */

import React from "react";
import { formatCurrency } from "@/lib/format";

export interface ChipTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string | number;
    value?: number | string;
    dataKey?: string | number;
    color?: string;
    [key: string]: unknown;
  }>;
  label?: string | number;
  /** Display currency for amount formatting (symbol). */
  displayCurrency?: string;
  [key: string]: unknown;
}

export function ChipTooltip(props: ChipTooltipProps & Record<string, unknown>) {
  const { active, payload, label, displayCurrency = "AED" } = props;
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-3 space-y-2 min-w-[140px]">
      {/* Period Label */}
      {label && (
        <div className="text-xs font-semibold text-gray-700 mb-2 pb-2 border-b border-gray-200">
          {label}
        </div>
      )}
      
      {/* Individual Chips for each data point */}
      <div className="space-y-1.5">
        {payload.map((entry, index) => {
          const value = typeof entry.value === "number" ? entry.value : typeof entry.value === "string" ? parseFloat(entry.value) || 0 : 0;
          const name = String(entry.name ?? entry.dataKey ?? "");
          const dataKey = String(entry.dataKey ?? "");
          const barColor = entry.color || "#6b7280"; // Default to grey if no color
          
          // Handle percentage values (for profitability chart margin)
          // Check if the dataKey or name indicates it's a percentage
          const isPercentage = dataKey.toLowerCase() === "margin" || 
                              name.toLowerCase().includes("margin") ||
                              name.toLowerCase().includes("%");
          
          const displayValue = typeof value === "number" && isPercentage
            ? `${value.toFixed(1)}%`
            : formatCurrency(value, displayCurrency);
          
          // Convert hex to RGB for opacity calculation
          const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16)
            } : { r: 107, g: 114, b: 128 }; // Default grey
          };
          
          const rgb = hexToRgb(barColor);
          // Create a light tinted background (15% opacity of bar color on white)
          const backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
          // Border with 30% opacity for subtle definition
          const borderColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
          
          return (
            <div
              key={index}
              className="inline-flex flex-col items-start px-3 py-1.5 rounded-lg shadow-sm w-full"
              style={{
                backgroundColor,
                border: `1px solid ${borderColor}`,
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
              }}
            >
              <span className="text-xs font-medium mb-0.5" style={{ color: barColor }}>
                {name}
              </span>
              <span className="text-sm font-semibold" style={{ color: barColor }}>
                {displayValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

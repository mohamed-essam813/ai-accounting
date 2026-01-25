/**
 * Dashboard Metrics Types
 * Unified filter contract and chart output schema
 */

import type { DateRange } from "@/lib/utils/period-comparison";

export type PeriodMode = 
  | "THIS_MONTH" 
  | "THIS_QUARTER" 
  | "THIS_YEAR"
  | "LAST_MONTH"
  | "LAST_QUARTER"
  | "LAST_YEAR"
  | "CUSTOM";

export type CompareMode = "NONE" | "PREVIOUS" | "SPLY" | "MULTI";

export type BucketType = "DAY" | "WEEK" | "MONTH" | "QUARTER";

/**
 * Global Filter Contract (Single Source of Truth)
 */
export interface DashboardFilters {
  period_mode: PeriodMode;
  start_date: string | null;   // only used when period_mode=CUSTOM
  end_date: string | null;     // only used when period_mode=CUSTOM
  compare_mode: CompareMode;
  multi_n: 3 | 6 | 12 | null;
  multi_unit: "MONTH" | "QUARTER" | "YEAR" | null;
  display_currency: string;
  base_currency: string;
}

/**
 * Derived Ranges
 */
export interface DerivedRanges {
  current_range: DateRange;
  comparison_ranges: DateRange[]; // 0..N ranges based on compare_mode
}

/**
 * Chart Data Point
 */
export interface ChartDataPoint {
  x: number;           // Bucket index (0, 1, 2, ...)
  label: string;        // Display label (e.g., "Jan 2024", "Week 1")
  date: string;        // ISO date (start of bucket)
  value: number;       // Aggregated value for this bucket
}

/**
 * Chart Series
 */
export interface ChartSeries {
  name: string;         // "Current", "Previous Period", "Same Period Last Year", "Period -2", etc.
  points: ChartDataPoint[];
}

/**
 * Chart Summary
 */
export interface ChartSummary {
  current_total: number;
  compare_total: number | null;  // null if no comparison
  delta_amount: number | null;
  delta_percent: number | null;
}

/**
 * Standard Chart Output Schema
 */
export interface ChartOutput {
  chart_id: string;
  title: string;
  bucket: BucketType;
  series: ChartSeries[];
  summary: ChartSummary;
}

/**
 * Time Bucket Configuration
 */
export interface TimeBucket {
  type: BucketType;
  startDate: string;
  endDate: string;
  label: string;
  index: number;
}

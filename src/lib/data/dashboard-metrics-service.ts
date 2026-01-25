/**
 * Unified Dashboard Metrics Service
 * Single source of truth for all dashboard chart data
 * 
 * Receives: filter contract (current_range, comparison_ranges, display_currency, bucket)
 * Returns: standardized chart data for all widgets
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import type { DashboardFilters, DerivedRanges, ChartOutput, ChartSeries, ChartDataPoint, BucketType } from "./dashboard-metrics-types";
import type { DateRange } from "@/lib/utils/period-comparison";
import { determineBucketType, generateTimeBuckets } from "@/lib/utils/time-bucketing";
import { convertCurrency, getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import {
  getCurrentMonth,
  getCurrentQuarter,
  getCurrentYear,
  getLastMonth,
  getLastQuarter,
  getLastYear,
  getPreviousPeriodRange,
  getSamePeriodLastYear,
} from "@/lib/utils/period-comparison";
import { getMultiPeriodFromCustomRange } from "./multi-period-comparison";
import type { PeriodMode, CompareMode } from "./dashboard-metrics-types";

/**
 * Format date to YYYY-MM-DD in local timezone (not UTC)
 * Prevents timezone shifts when converting dates
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse date string as local date (not UTC)
 * Prevents timezone shifts when parsing YYYY-MM-DD strings
 */
function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Build filter contract from URL params
 */
export async function buildFilterContract(
  periodMode: PeriodMode,
  startDate: string | undefined,
  endDate: string | undefined,
  compareMode: CompareMode,
  multiN: 3 | 6 | 12,
  multiUnit: "MONTH" | "QUARTER" | "YEAR",
  displayCurrency: string | undefined
): Promise<DashboardFilters> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User not authenticated");
  }

  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);

  return {
    period_mode: periodMode,
    start_date: startDate || null,
    end_date: endDate || null,
    compare_mode: compareMode,
    multi_n: compareMode === "MULTI" ? multiN : null,
    multi_unit: compareMode === "MULTI" ? multiUnit : null,
    display_currency: displayCurrency || baseCurrency,
    base_currency: baseCurrency,
  };
}

/**
 * Derive date ranges from filter contract
 */
export function deriveRanges(filters: DashboardFilters): DerivedRanges {
  let currentRange: DateRange;

  // Determine current range based on period_mode
  if (filters.period_mode === "CUSTOM" && filters.start_date && filters.end_date) {
    currentRange = {
      startDate: filters.start_date,
      endDate: filters.end_date,
    };
  } else {
    switch (filters.period_mode) {
      case "THIS_QUARTER":
        currentRange = getCurrentQuarter();
        break;
      case "THIS_YEAR":
        currentRange = getCurrentYear();
        break;
      case "LAST_MONTH":
        currentRange = getLastMonth();
        break;
      case "LAST_QUARTER":
        currentRange = getLastQuarter();
        break;
      case "LAST_YEAR":
        currentRange = getLastYear();
        break;
      default: // "THIS_MONTH"
        currentRange = getCurrentMonth();
    }
  }

  // Determine comparison ranges based on compare_mode
  const comparisonRanges: DateRange[] = [];

  if (filters.compare_mode === "PREVIOUS") {
    comparisonRanges.push(getPreviousPeriodRange(currentRange.startDate, currentRange.endDate));
  } else if (filters.compare_mode === "SPLY") {
    comparisonRanges.push(getSamePeriodLastYear(currentRange.startDate, currentRange.endDate));
  } else if (filters.compare_mode === "MULTI" && filters.multi_n && filters.multi_unit) {
    if (filters.period_mode === "CUSTOM" && filters.start_date && filters.end_date) {
      // Multi-period from custom range
      const ranges = getMultiPeriodFromCustomRange(
        currentRange,
        filters.multi_n,
        filters.multi_unit
      );
      // Exclude the last one (current) and reverse to get oldest first
      comparisonRanges.push(...ranges.slice(0, -1).reverse().map(r => r.dateRange));
    } else {
      // Multi-period from preset - handled separately
      // For now, generate N previous periods
      for (let i = filters.multi_n; i >= 1; i--) {
        let range: DateRange;
        switch (filters.multi_unit) {
          case "MONTH": {
            const monthDate = parseLocalDate(currentRange.startDate);
            monthDate.setMonth(monthDate.getMonth() - i);
            const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
            range = {
              startDate: formatLocalDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)),
              endDate: formatLocalDate(monthEnd),
            };
            break;
          }
          case "QUARTER": {
            const quarterDate = parseLocalDate(currentRange.startDate);
            quarterDate.setMonth(quarterDate.getMonth() - i * 3);
            const quarter = Math.floor(quarterDate.getMonth() / 3);
            range = {
              startDate: formatLocalDate(new Date(quarterDate.getFullYear(), quarter * 3, 1)),
              endDate: formatLocalDate(new Date(quarterDate.getFullYear(), (quarter + 1) * 3, 0)),
            };
            break;
          }
          case "YEAR": {
            const yearDate = parseLocalDate(currentRange.startDate);
            yearDate.setFullYear(yearDate.getFullYear() - i);
            range = {
              startDate: formatLocalDate(new Date(yearDate.getFullYear(), 0, 1)),
              endDate: formatLocalDate(new Date(yearDate.getFullYear(), 11, 31)),
            };
            break;
          }
          default:
            // This should never happen due to type checking, but satisfy TypeScript
            throw new Error(`Unsupported multi_unit: ${filters.multi_unit}`);
        }
        comparisonRanges.push(range);
      }
    }
  }

  return {
    current_range: currentRange,
    comparison_ranges: comparisonRanges,
  };
}

/**
 * Get revenue data for a date range (with time bucketing)
 */
async function getRevenueDataForRange(
  dateRange: DateRange,
  bucketType: BucketType,
  displayCurrency: string,
  baseCurrency: string,
  tenantId: string
): Promise<ChartDataPoint[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();

  // Get all revenue accounts
  const { data: revenueAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", "revenue");

  if (!revenueAccounts || revenueAccounts.length === 0) {
    // Return empty buckets
    const buckets = generateTimeBuckets(dateRange, bucketType);
    return buckets.map(b => ({ x: b.index, label: b.label, date: b.startDate, value: 0 }));
  }

  const accountIds = revenueAccounts.map((acc) => acc.id);

  // Get all revenue transactions in the range
  const { data: lines } = await supabase
    .from("journal_lines")
    .select("credit, journal_entries!inner(date, tenant_id, status)")
    .in("account_id", accountIds)
    .eq("journal_entries.tenant_id", tenantId)
    .eq("journal_entries.status", "posted")
    .gte("journal_entries.date", dateRange.startDate)
    .lte("journal_entries.date", dateRange.endDate);

  if (!lines || lines.length === 0) {
    const buckets = generateTimeBuckets(dateRange, bucketType);
    return buckets.map(b => ({ x: b.index, label: b.label, date: b.startDate, value: 0 }));
  }

  // Generate buckets
  const buckets = generateTimeBuckets(dateRange, bucketType);

  // Aggregate by bucket
  const bucketData = await Promise.all(
    buckets.map(async (bucket) => {
      const bucketLines = lines.filter((line) => {
        const entryDate = (line.journal_entries as { date: string }).date;
        return entryDate >= bucket.startDate && entryDate <= bucket.endDate;
      });

      let total = bucketLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

      // Convert currency if needed
      if (displayCurrency !== baseCurrency && total > 0) {
        // Use end date of bucket for conversion
        total = await convertCurrency(total, baseCurrency, displayCurrency, bucket.endDate, tenantId);
      }

      return {
        x: bucket.index,
        label: bucket.label,
        date: bucket.startDate,
        value: total,
      };
    })
  );

  return bucketData;
}

/**
 * Get expense data for a date range (with time bucketing)
 */
async function getExpenseDataForRange(
  dateRange: DateRange,
  bucketType: BucketType,
  displayCurrency: string,
  baseCurrency: string,
  tenantId: string
): Promise<ChartDataPoint[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();

  // Get all expense accounts
  const { data: expenseAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", "expense");

  if (!expenseAccounts || expenseAccounts.length === 0) {
    const buckets = generateTimeBuckets(dateRange, bucketType);
    return buckets.map(b => ({ x: b.index, label: b.label, date: b.startDate, value: 0 }));
  }

  const accountIds = expenseAccounts.map((acc) => acc.id);

  // Get all expense transactions in the range
  const { data: lines } = await supabase
    .from("journal_lines")
    .select("debit, journal_entries!inner(date, tenant_id, status)")
    .in("account_id", accountIds)
    .eq("journal_entries.tenant_id", tenantId)
    .eq("journal_entries.status", "posted")
    .gte("journal_entries.date", dateRange.startDate)
    .lte("journal_entries.date", dateRange.endDate);

  if (!lines || lines.length === 0) {
    const buckets = generateTimeBuckets(dateRange, bucketType);
    return buckets.map(b => ({ x: b.index, label: b.label, date: b.startDate, value: 0 }));
  }

  // Generate buckets
  const buckets = generateTimeBuckets(dateRange, bucketType);

  // Aggregate by bucket
  const bucketData = await Promise.all(
    buckets.map(async (bucket) => {
      const bucketLines = lines.filter((line) => {
        const entryDate = (line.journal_entries as { date: string }).date;
        return entryDate >= bucket.startDate && entryDate <= bucket.endDate;
      });

      let total = bucketLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);

      // Convert currency if needed
      if (displayCurrency !== baseCurrency && total > 0) {
        total = await convertCurrency(total, baseCurrency, displayCurrency, bucket.endDate, tenantId);
      }

      return {
        x: bucket.index,
        label: bucket.label,
        date: bucket.startDate,
        value: total,
      };
    })
  );

  return bucketData;
}

/**
 * Get cash flow data for a date range (with time bucketing)
 */
async function getCashFlowDataForRange(
  dateRange: DateRange,
  bucketType: BucketType,
  displayCurrency: string,
  baseCurrency: string,
  tenantId: string
): Promise<ChartDataPoint[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) return [];

  const supabase = await createServerSupabaseClient();

  // Get cash account
  const { data: cashAccount } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("code", "1000")
    .maybeSingle();

  if (!cashAccount) {
    const buckets = generateTimeBuckets(dateRange, bucketType);
    return buckets.map(b => ({ x: b.index, label: b.label, date: b.startDate, value: 0 }));
  }

  // Get all cash transactions in the range
  const { data: lines } = await supabase
    .from("journal_lines")
    .select("debit, credit, journal_entries!inner(date, tenant_id, status)")
    .eq("account_id", cashAccount.id)
    .eq("journal_entries.tenant_id", tenantId)
    .eq("journal_entries.status", "posted")
    .gte("journal_entries.date", dateRange.startDate)
    .lte("journal_entries.date", dateRange.endDate);

  if (!lines || lines.length === 0) {
    const buckets = generateTimeBuckets(dateRange, bucketType);
    return buckets.map(b => ({ x: b.index, label: b.label, date: b.startDate, value: 0 }));
  }

  // Generate buckets
  const buckets = generateTimeBuckets(dateRange, bucketType);

  // Aggregate by bucket (cash in = credit, cash out = debit, net = credit - debit)
  const bucketData = await Promise.all(
    buckets.map(async (bucket) => {
      const bucketLines = lines.filter((line) => {
        const entryDate = (line.journal_entries as { date: string }).date;
        return entryDate >= bucket.startDate && entryDate <= bucket.endDate;
      });

      const cashIn = bucketLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
      const cashOut = bucketLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
      let netFlow = cashIn - cashOut;

      // Convert currency if needed
      if (displayCurrency !== baseCurrency && netFlow !== 0) {
        netFlow = await convertCurrency(netFlow, baseCurrency, displayCurrency, bucket.endDate, tenantId);
      }

      return {
        x: bucket.index,
        label: bucket.label,
        date: bucket.startDate,
        value: netFlow,
      };
    })
  );

  return bucketData;
}

/**
 * Get Revenue Trend Chart Data
 */
export async function getRevenueTrendChart(
  filters: DashboardFilters,
  ranges: DerivedRanges
): Promise<ChartOutput> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      chart_id: "revenue_trend",
      title: "Revenue Trend",
      bucket: "MONTH",
      series: [],
      summary: { current_total: 0, compare_total: null, delta_amount: null, delta_percent: null },
    };
  }

  const bucketType = determineBucketType(ranges.current_range);
  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);

  // Get current period data
  const currentPoints = await getRevenueDataForRange(
    ranges.current_range,
    bucketType,
    filters.display_currency,
    baseCurrency,
    user.tenant.id
  );

  const series: ChartSeries[] = [
    {
      name: "Current",
      points: currentPoints,
    },
  ];

  // Get comparison data
  for (let i = 0; i < ranges.comparison_ranges.length; i++) {
    const compRange = ranges.comparison_ranges[i];
    const compPoints = await getRevenueDataForRange(
      compRange,
      bucketType,
      filters.display_currency,
      baseCurrency,
      user.tenant.id
    );

    // Align by relative index - use current labels, map comparison values by index
    const maxLength = Math.max(currentPoints.length, compPoints.length);
    const alignedCompPoints: ChartDataPoint[] = [];
    
    for (let idx = 0; idx < maxLength; idx++) {
      const currentPoint = currentPoints[idx];
      const compPoint = compPoints[idx] || { x: idx, label: "", date: "", value: 0 };
      
      alignedCompPoints.push({
        x: idx,
        label: currentPoint?.label || compPoint.label,
        date: currentPoint?.date || compPoint.date,
        value: compPoint.value,
      });
    }

    let seriesName = "Previous Period";
    if (filters.compare_mode === "SPLY") {
      seriesName = "Same Period Last Year";
    } else if (filters.compare_mode === "MULTI") {
      seriesName = `Period -${ranges.comparison_ranges.length - i}`;
    }

    series.push({
      name: seriesName,
      points: alignedCompPoints,
    });
  }

  // Calculate summary
  const currentTotal = currentPoints.reduce((sum, p) => sum + p.value, 0);
  const compareTotal = ranges.comparison_ranges.length > 0
    ? series[1]?.points.reduce((sum, p) => sum + p.value, 0) || 0
    : null;
  const deltaAmount = compareTotal !== null ? currentTotal - compareTotal : null;
  const deltaPercent = compareTotal !== null && compareTotal !== 0
    ? ((deltaAmount || 0) / Math.abs(compareTotal)) * 100
    : null;

  return {
    chart_id: "revenue_trend",
    title: "Revenue Trend",
    bucket: bucketType,
    series,
    summary: {
      current_total: currentTotal,
      compare_total: compareTotal,
      delta_amount: deltaAmount,
      delta_percent: deltaPercent,
    },
  };
}

/**
 * Get Expense Trend Chart Data
 */
export async function getExpenseTrendChart(
  filters: DashboardFilters,
  ranges: DerivedRanges
): Promise<ChartOutput> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      chart_id: "expense_trend",
      title: "Expense Trend",
      bucket: "MONTH",
      series: [],
      summary: { current_total: 0, compare_total: null, delta_amount: null, delta_percent: null },
    };
  }

  const bucketType = determineBucketType(ranges.current_range);
  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);

  // Get current period data
  const currentPoints = await getExpenseDataForRange(
    ranges.current_range,
    bucketType,
    filters.display_currency,
    baseCurrency,
    user.tenant.id
  );

  const series: ChartSeries[] = [
    {
      name: "Current",
      points: currentPoints,
    },
  ];

  // Get comparison data
  for (let i = 0; i < ranges.comparison_ranges.length; i++) {
    const compRange = ranges.comparison_ranges[i];
    const compPoints = await getExpenseDataForRange(
      compRange,
      bucketType,
      filters.display_currency,
      baseCurrency,
      user.tenant.id
    );

    // Align by relative index - use current labels, map comparison values by index
    const maxLength = Math.max(currentPoints.length, compPoints.length);
    const alignedCompPoints: ChartDataPoint[] = [];
    
    for (let idx = 0; idx < maxLength; idx++) {
      const currentPoint = currentPoints[idx];
      const compPoint = compPoints[idx] || { x: idx, label: "", date: "", value: 0 };
      
      alignedCompPoints.push({
        x: idx,
        label: currentPoint?.label || compPoint.label,
        date: currentPoint?.date || compPoint.date,
        value: compPoint.value,
      });
    }

    let seriesName = "Previous Period";
    if (filters.compare_mode === "SPLY") {
      seriesName = "Same Period Last Year";
    } else if (filters.compare_mode === "MULTI") {
      seriesName = `Period -${ranges.comparison_ranges.length - i}`;
    }

    series.push({
      name: seriesName,
      points: alignedCompPoints,
    });
  }

  // Calculate summary
  const currentTotal = currentPoints.reduce((sum, p) => sum + p.value, 0);
  const compareTotal = ranges.comparison_ranges.length > 0
    ? series[1]?.points.reduce((sum, p) => sum + p.value, 0) || 0
    : null;
  const deltaAmount = compareTotal !== null ? currentTotal - compareTotal : null;
  const deltaPercent = compareTotal !== null && compareTotal !== 0
    ? ((deltaAmount || 0) / Math.abs(compareTotal)) * 100
    : null;

  return {
    chart_id: "expense_trend",
    title: "Expense Trend",
    bucket: bucketType,
    series,
    summary: {
      current_total: currentTotal,
      compare_total: compareTotal,
      delta_amount: deltaAmount,
      delta_percent: deltaPercent,
    },
  };
}

/**
 * Get AR Ageing data as-of a specific date
 */
async function getARAgeingAsOfDate(
  asOfDate: string,
  displayCurrency: string,
  baseCurrency: string,
  tenantId: string
): Promise<{
  total: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return { total: 0, bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0 };
  }

  const supabase = await createServerSupabaseClient();
  // Parse as local date to avoid timezone shifts
  const [year, month, day] = asOfDate.split("-").map(Number);
  const asOf = new Date(year, month - 1, day);

  // Get receivables account
  const { data: receivablesAccount } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("code", "1100")
    .maybeSingle();

  if (!receivablesAccount) {
    return { total: 0, bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0 };
  }

  // Get all AR transactions up to as-of date
  // We need to get all transactions (both debits and credits) to calculate outstanding balance
  const { data: lines } = await supabase
    .from("journal_lines")
    .select("debit, credit, journal_entries!inner(date, tenant_id, status, id)")
    .eq("account_id", receivablesAccount.id)
    .eq("journal_entries.tenant_id", tenantId)
    .eq("journal_entries.status", "posted")
    .lte("journal_entries.date", asOfDate)
    .order("journal_entries.date", { ascending: true });

  if (!lines || lines.length === 0) {
    return { total: 0, bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0 };
  }

  // Get invoice due dates from drafts
  const entryIds = [...new Set(lines.map(l => (l.journal_entries as { id: string }).id))];
  const { data: drafts } = await supabase
    .from("drafts")
    .select("posted_entry_id, data_json")
    .eq("tenant_id", tenantId)
    .eq("intent", "create_invoice")
    .eq("status", "posted")
    .in("posted_entry_id", entryIds);

  // Calculate outstanding per invoice
  const invoiceOutstanding: Map<string, { amount: number; dueDate: Date; entryDate: Date }> = new Map();

  lines.forEach((line) => {
    const entry = line.journal_entries as { id: string; date: string };
    const entryId = entry.id;
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    const net = debit - credit;

    // Find draft for this entry
    const draft = drafts?.find(d => d.posted_entry_id === entryId);
    const dataJson = draft?.data_json as Record<string, unknown> | undefined;
    const dueDateStr = dataJson?.["due_date"] as string | undefined;
    const invoiceDateStr = dataJson?.["date"] as string | undefined;

    // Parse dates as local to avoid timezone shifts
    const [entryYear, entryMonth, entryDay] = entry.date.split("-").map(Number);
    const entryDate = new Date(entryYear, entryMonth - 1, entryDay);
    
    const dueDate = dueDateStr 
      ? (() => {
          const [dueYear, dueMonth, dueDay] = dueDateStr.split("-").map(Number);
          return new Date(dueYear, dueMonth - 1, dueDay);
        })()
      : new Date(entryDate.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

    const key = `${entryId}-${entry.date}`;
    const existing = invoiceOutstanding.get(key) || { amount: 0, dueDate, entryDate };
    invoiceOutstanding.set(key, {
      amount: existing.amount + net,
      dueDate,
      entryDate,
    });
  });

  // Calculate ageing buckets
  let bucket_0_30 = 0;
  let bucket_31_60 = 0;
  let bucket_61_90 = 0;
  let bucket_90_plus = 0;

  for (const [_, { amount, dueDate }] of invoiceOutstanding) {
    if (amount <= 0) continue; // Only outstanding amounts

    const daysOverdue = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysOverdue <= 0) {
      bucket_0_30 += amount;
    } else if (daysOverdue <= 30) {
      bucket_31_60 += amount;
    } else if (daysOverdue <= 60) {
      bucket_61_90 += amount;
    } else {
      bucket_90_plus += amount;
    }
  }

  const total = bucket_0_30 + bucket_31_60 + bucket_61_90 + bucket_90_plus;

  // Convert currency if needed
  if (displayCurrency !== baseCurrency && total > 0) {
    const [conv_0_30, conv_31_60, conv_61_90, conv_90_plus] = await Promise.all([
      convertCurrency(bucket_0_30, baseCurrency, displayCurrency, asOfDate, tenantId),
      convertCurrency(bucket_31_60, baseCurrency, displayCurrency, asOfDate, tenantId),
      convertCurrency(bucket_61_90, baseCurrency, displayCurrency, asOfDate, tenantId),
      convertCurrency(bucket_90_plus, baseCurrency, displayCurrency, asOfDate, tenantId),
    ]);
    return {
      total: conv_0_30 + conv_31_60 + conv_61_90 + conv_90_plus,
      bucket_0_30: conv_0_30,
      bucket_31_60: conv_31_60,
      bucket_61_90: conv_61_90,
      bucket_90_plus: conv_90_plus,
    };
  }

  return { total, bucket_0_30, bucket_31_60, bucket_61_90, bucket_90_plus };
}

/**
 * Get AP Ageing data as-of a specific date
 */
async function getAPAgeingAsOfDate(
  asOfDate: string,
  displayCurrency: string,
  baseCurrency: string,
  tenantId: string
): Promise<{
  total: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return { total: 0, bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0 };
  }

  const supabase = await createServerSupabaseClient();
  // Parse as local date to avoid timezone shifts
  const [year, month, day] = asOfDate.split("-").map(Number);
  const asOf = new Date(year, month - 1, day);

  // Get payables account
  const { data: payablesAccount } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("code", "2000")
    .maybeSingle();

  if (!payablesAccount) {
    return { total: 0, bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0 };
  }

  // Get all AP transactions up to as-of date
  // We need to get all transactions (both debits and credits) to calculate outstanding balance
  const { data: lines } = await supabase
    .from("journal_lines")
    .select("debit, credit, journal_entries!inner(date, tenant_id, status, id)")
    .eq("account_id", payablesAccount.id)
    .eq("journal_entries.tenant_id", tenantId)
    .eq("journal_entries.status", "posted")
    .lte("journal_entries.date", asOfDate)
    .order("journal_entries.date", { ascending: true });

  if (!lines || lines.length === 0) {
    return { total: 0, bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0 };
  }

  // Get bill due dates from drafts
  const entryIds = [...new Set(lines.map(l => (l.journal_entries as { id: string }).id))];
  const { data: drafts } = await supabase
    .from("drafts")
    .select("posted_entry_id, data_json")
    .eq("tenant_id", tenantId)
    .eq("intent", "create_bill")
    .eq("status", "posted")
    .in("posted_entry_id", entryIds);

  // Calculate outstanding per bill
  const billOutstanding: Map<string, { amount: number; dueDate: Date; entryDate: Date }> = new Map();

  lines.forEach((line) => {
    const entry = line.journal_entries as { id: string; date: string };
    const entryId = entry.id;
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    const net = credit - debit; // For AP, credit increases, debit decreases

    // Find draft for this entry
    const draft = drafts?.find(d => d.posted_entry_id === entryId);
    const dataJson = draft?.data_json as Record<string, unknown> | undefined;
    const dueDateStr = dataJson?.["due_date"] as string | undefined;
    const billDateStr = dataJson?.["date"] as string | undefined;

    // Parse dates as local to avoid timezone shifts
    const [entryYear, entryMonth, entryDay] = entry.date.split("-").map(Number);
    const entryDate = new Date(entryYear, entryMonth - 1, entryDay);
    
    const dueDate = dueDateStr 
      ? (() => {
          const [dueYear, dueMonth, dueDay] = dueDateStr.split("-").map(Number);
          return new Date(dueYear, dueMonth - 1, dueDay);
        })()
      : new Date(entryDate.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

    const key = `${entryId}-${entry.date}`;
    const existing = billOutstanding.get(key) || { amount: 0, dueDate, entryDate };
    billOutstanding.set(key, {
      amount: existing.amount + net,
      dueDate,
      entryDate,
    });
  });

  // Calculate ageing buckets
  let bucket_0_30 = 0;
  let bucket_31_60 = 0;
  let bucket_61_90 = 0;
  let bucket_90_plus = 0;

  for (const [_, { amount, dueDate }] of billOutstanding) {
    if (amount <= 0) continue; // Only outstanding amounts

    const daysOverdue = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysOverdue <= 0) {
      bucket_0_30 += amount;
    } else if (daysOverdue <= 30) {
      bucket_31_60 += amount;
    } else if (daysOverdue <= 60) {
      bucket_61_90 += amount;
    } else {
      bucket_90_plus += amount;
    }
  }

  const total = bucket_0_30 + bucket_31_60 + bucket_61_90 + bucket_90_plus;

  // Convert currency if needed
  if (displayCurrency !== baseCurrency && total > 0) {
    const [conv_0_30, conv_31_60, conv_61_90, conv_90_plus] = await Promise.all([
      convertCurrency(bucket_0_30, baseCurrency, displayCurrency, asOfDate, tenantId),
      convertCurrency(bucket_31_60, baseCurrency, displayCurrency, asOfDate, tenantId),
      convertCurrency(bucket_61_90, baseCurrency, displayCurrency, asOfDate, tenantId),
      convertCurrency(bucket_90_plus, baseCurrency, displayCurrency, asOfDate, tenantId),
    ]);
    return {
      total: conv_0_30 + conv_31_60 + conv_61_90 + conv_90_plus,
      bucket_0_30: conv_0_30,
      bucket_31_60: conv_31_60,
      bucket_61_90: conv_61_90,
      bucket_90_plus: conv_90_plus,
    };
  }

  return { total, bucket_0_30, bucket_31_60, bucket_61_90, bucket_90_plus };
}

/**
 * Get AR/AP Ageing Chart Data
 */
export async function getARAPAgeingChart(
  filters: DashboardFilters,
  ranges: DerivedRanges
): Promise<{
  ar: {
    current: { total: number; bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90_plus: number };
    comparison: { total: number; bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90_plus: number } | null;
  };
  ap: {
    current: { total: number; bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90_plus: number };
    comparison: { total: number; bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90_plus: number } | null;
  };
}> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      ar: {
        current: { total: 0, bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0 },
        comparison: null,
      },
      ap: {
        current: { total: 0, bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0 },
        comparison: null,
      },
    };
  }

  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);
  const asOfDate = ranges.current_range.endDate;

  // Get current period ageing (as-of end date)
  const [arCurrent, apCurrent] = await Promise.all([
    getARAgeingAsOfDate(asOfDate, filters.display_currency, baseCurrency, user.tenant.id),
    getAPAgeingAsOfDate(asOfDate, filters.display_currency, baseCurrency, user.tenant.id),
  ]);

  // Get comparison period ageing if comparison mode is enabled
  let arComparison = null;
  let apComparison = null;

  if (ranges.comparison_ranges.length > 0) {
    const comparisonAsOfDate = ranges.comparison_ranges[0].endDate;
    [arComparison, apComparison] = await Promise.all([
      getARAgeingAsOfDate(comparisonAsOfDate, filters.display_currency, baseCurrency, user.tenant.id),
      getAPAgeingAsOfDate(comparisonAsOfDate, filters.display_currency, baseCurrency, user.tenant.id),
    ]);
  }

  return {
    ar: {
      current: arCurrent,
      comparison: arComparison,
    },
    ap: {
      current: apCurrent,
      comparison: apComparison,
    },
  };
}

/**
 * Get Profitability Chart Data (Net Profit & Margin)
 */
export async function getProfitabilityChart(
  filters: DashboardFilters,
  ranges: DerivedRanges
): Promise<ChartOutput> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      chart_id: "profitability",
      title: "Profitability",
      bucket: "MONTH",
      series: [],
      summary: { current_total: 0, compare_total: null, delta_amount: null, delta_percent: null },
    };
  }

  const bucketType = determineBucketType(ranges.current_range);
  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);

  // Get revenue and expense data
  const [revenuePoints, expensePoints] = await Promise.all([
    getRevenueDataForRange(ranges.current_range, bucketType, filters.display_currency, baseCurrency, user.tenant.id),
    getExpenseDataForRange(ranges.current_range, bucketType, filters.display_currency, baseCurrency, user.tenant.id),
  ]);

  // Calculate net profit (revenue - expenses) for each bucket
  const currentPoints: ChartDataPoint[] = revenuePoints.map((revPoint, idx) => {
    const expPoint = expensePoints[idx] || { value: 0 };
    return {
      x: revPoint.x,
      label: revPoint.label,
      date: revPoint.date,
      value: revPoint.value - expPoint.value, // Net profit
    };
  });

  const series: ChartSeries[] = [
    {
      name: "Current",
      points: currentPoints,
    },
  ];

  // Get comparison data
  for (let i = 0; i < ranges.comparison_ranges.length; i++) {
    const compRange = ranges.comparison_ranges[i];
    const [compRevenuePoints, compExpensePoints] = await Promise.all([
      getRevenueDataForRange(compRange, bucketType, filters.display_currency, baseCurrency, user.tenant.id),
      getExpenseDataForRange(compRange, bucketType, filters.display_currency, baseCurrency, user.tenant.id),
    ]);

    const compPoints: ChartDataPoint[] = compRevenuePoints.map((revPoint, idx) => {
      const expPoint = compExpensePoints[idx] || { value: 0 };
      return {
        x: idx,
        label: currentPoints[idx]?.label || revPoint.label,
        date: revPoint.date,
        value: revPoint.value - expPoint.value,
      };
    });

    let seriesName = "Previous Period";
    if (filters.compare_mode === "SPLY") {
      seriesName = "Same Period Last Year";
    } else if (filters.compare_mode === "MULTI") {
      seriesName = `Period -${ranges.comparison_ranges.length - i}`;
    }

    series.push({
      name: seriesName,
      points: compPoints,
    });
  }

  // Calculate summary
  const currentTotal = currentPoints.reduce((sum, p) => sum + p.value, 0);
  const revenueTotal = revenuePoints.reduce((sum, p) => sum + p.value, 0);
  const netMargin = revenueTotal !== 0 ? (currentTotal / revenueTotal) * 100 : 0;

  const compareTotal = ranges.comparison_ranges.length > 0
    ? series[1]?.points.reduce((sum, p) => sum + p.value, 0) || 0
    : null;
  const deltaAmount = compareTotal !== null ? currentTotal - compareTotal : null;
  const deltaPercent = compareTotal !== null && compareTotal !== 0
    ? ((deltaAmount || 0) / Math.abs(compareTotal)) * 100
    : null;

  return {
    chart_id: "profitability",
    title: "Profitability",
    bucket: bucketType,
    series,
    summary: {
      current_total: currentTotal,
      compare_total: compareTotal,
      delta_amount: deltaAmount,
      delta_percent: deltaPercent,
    },
  };
}

/**
 * Get Cash Flow Chart Data
 */
export async function getCashFlowChart(
  filters: DashboardFilters,
  ranges: DerivedRanges
): Promise<ChartOutput> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      chart_id: "cash_flow",
      title: "Cash Flow",
      bucket: "MONTH",
      series: [],
      summary: { current_total: 0, compare_total: null, delta_amount: null, delta_percent: null },
    };
  }

  const bucketType = determineBucketType(ranges.current_range);
  const baseCurrency = await getTenantBaseCurrency(user.tenant.id);

  // Get current period data
  const currentPoints = await getCashFlowDataForRange(
    ranges.current_range,
    bucketType,
    filters.display_currency,
    baseCurrency,
    user.tenant.id
  );

  const series: ChartSeries[] = [
    {
      name: "Current",
      points: currentPoints,
    },
  ];

  // Get comparison data
  for (let i = 0; i < ranges.comparison_ranges.length; i++) {
    const compRange = ranges.comparison_ranges[i];
    const compPoints = await getCashFlowDataForRange(
      compRange,
      bucketType,
      filters.display_currency,
      baseCurrency,
      user.tenant.id
    );

    // Align by relative index - use current labels, map comparison values by index
    const maxLength = Math.max(currentPoints.length, compPoints.length);
    const alignedCompPoints: ChartDataPoint[] = [];
    
    for (let idx = 0; idx < maxLength; idx++) {
      const currentPoint = currentPoints[idx];
      const compPoint = compPoints[idx] || { x: idx, label: "", date: "", value: 0 };
      
      alignedCompPoints.push({
        x: idx,
        label: currentPoint?.label || compPoint.label,
        date: currentPoint?.date || compPoint.date,
        value: compPoint.value,
      });
    }

    let seriesName = "Previous Period";
    if (filters.compare_mode === "SPLY") {
      seriesName = "Same Period Last Year";
    } else if (filters.compare_mode === "MULTI") {
      seriesName = `Period -${ranges.comparison_ranges.length - i}`;
    }

    series.push({
      name: seriesName,
      points: alignedCompPoints,
    });
  }

  // Calculate summary
  const currentTotal = currentPoints.reduce((sum, p) => sum + p.value, 0);
  const compareTotal = ranges.comparison_ranges.length > 0
    ? series[1]?.points.reduce((sum, p) => sum + p.value, 0) || 0
    : null;
  const deltaAmount = compareTotal !== null ? currentTotal - compareTotal : null;
  const deltaPercent = compareTotal !== null && compareTotal !== 0
    ? ((deltaAmount || 0) / Math.abs(compareTotal)) * 100
    : null;

  return {
    chart_id: "cash_flow",
    title: "Cash Flow",
    bucket: bucketType,
    series,
    summary: {
      current_total: currentTotal,
      compare_total: compareTotal,
      delta_amount: deltaAmount,
      delta_percent: deltaPercent,
    },
  };
}

/**
 * Time Bucketing Utilities
 * Adaptive bucket resolution based on date range length
 */

import type { BucketType, TimeBucket } from "@/lib/data/dashboard-metrics-types";
import type { DateRange } from "./period-comparison";
import { formatLocalDate, parseLocalDate } from "./period-comparison";

/**
 * Determine bucket type based on date range length
 */
export function determineBucketType(dateRange: DateRange): BucketType {
  // Parse as local dates to avoid timezone shifts
  const start = parseLocalDate(dateRange.startDate);
  const end = parseLocalDate(dateRange.endDate);
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (daysDiff <= 31) {
    return "DAY";
  } else if (daysDiff <= 180) {
    return "WEEK";
  } else if (daysDiff <= 730) {
    return "MONTH";
  } else {
    return "QUARTER";
  }
}

/**
 * Generate time buckets for a date range
 */
export function generateTimeBuckets(dateRange: DateRange, bucketType: BucketType): TimeBucket[] {
  const buckets: TimeBucket[] = [];
  // Parse as local dates to avoid timezone shifts
  const start = parseLocalDate(dateRange.startDate);
  const end = parseLocalDate(dateRange.endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // Month names array - declared once for all cases
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let current = new Date(start);
  let index = 0;

  while (current <= end) {
    let bucketStart = new Date(current);
    let bucketEnd: Date;
    let label: string;
    let nextStart: Date;

    switch (bucketType) {
      case "DAY": {
        // For DAY buckets, ensure first bucket starts exactly from start date
        if (index === 0) {
          bucketStart = new Date(start);
        } else {
          bucketStart = new Date(current);
        }
        bucketStart.setHours(0, 0, 0, 0);
        bucketEnd = new Date(bucketStart);
        bucketEnd.setHours(23, 59, 59, 999);
        if (bucketEnd > end) bucketEnd = end;
        if (bucketStart < start) bucketStart = new Date(start);
        // Format label using local date formatting to avoid timezone issues
        const monthName = monthNames[bucketStart.getMonth()];
        const day = bucketStart.getDate();
        label = `${monthName} ${day}`;
        nextStart = new Date(bucketStart);
        nextStart.setDate(bucketStart.getDate() + 1);
        nextStart.setHours(0, 0, 0, 0);
        break;
      }

      case "WEEK": {
        // For the first week, start from the period start date
        // For subsequent weeks, align to Monday
        if (index === 0) {
          // First week starts exactly from the period start date
          bucketStart = new Date(start);
        } else {
          // Subsequent weeks align to Monday
          const dayOfWeek = current.getDay();
          const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          bucketStart = new Date(current);
          bucketStart.setDate(current.getDate() + diff);
        }
        bucketStart.setHours(0, 0, 0, 0);
        
        // Calculate week end (6 days after start)
        const normalWeekEnd = new Date(bucketStart);
        normalWeekEnd.setDate(bucketStart.getDate() + 6);
        normalWeekEnd.setHours(23, 59, 59, 999);
        
        // Check if next week would be beyond the period end
        const nextWeekStart = new Date(bucketStart);
        nextWeekStart.setDate(bucketStart.getDate() + 7);
        nextWeekStart.setHours(0, 0, 0, 0);
        
        // Compare at day level (format to YYYY-MM-DD and compare strings)
        const nextWeekStartDay = formatLocalDate(nextWeekStart);
        const periodEndDay = formatLocalDate(end);
        const normalWeekEndDay = formatLocalDate(normalWeekEnd);
        
        // Determine if this is the last week and if we need to extend it
        const isLastWeek = nextWeekStartDay > periodEndDay;
        const needsExtension = normalWeekEndDay < periodEndDay;
        
        if (isLastWeek && needsExtension) {
          // This is the last week and it needs to be extended to period end
          bucketEnd = end;
        } else if (normalWeekEnd > end) {
          // Normal week, clamp to period end if needed
          bucketEnd = end;
        } else {
          bucketEnd = normalWeekEnd;
        }
        
        // Ensure bucket doesn't start before period start
        if (bucketStart < start) bucketStart = new Date(start);
        
        // Format label using the actual bucket start date (after clamping)
        // We'll format it after clamping in the bucket creation section
        // Store whether this is the last week for label generation
        label = `Week ${index + 1}`; // Will be updated with date after clamping
        nextStart = new Date(bucketStart);
        nextStart.setDate(bucketStart.getDate() + 7);
        nextStart.setHours(0, 0, 0, 0);
        break;
      }

      case "MONTH": {
        // For the first month, start from the period start date if it's not the 1st
        if (index === 0) {
          // First month starts from the period start date
          bucketStart = new Date(start);
          // But align the end to the end of the month
          const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
          bucketEnd = monthEnd < end ? monthEnd : end;
        } else {
          // Subsequent months align to month boundaries
          bucketStart = new Date(current.getFullYear(), current.getMonth(), 1);
          bucketEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        }
        bucketEnd.setHours(23, 59, 59, 999);
        if (bucketEnd > end) bucketEnd = end;
        if (bucketStart < start) bucketStart = new Date(start);
        // Format label using local date formatting to avoid timezone issues
        const monthName = monthNames[bucketStart.getMonth()];
        const year = bucketStart.getFullYear();
        label = `${monthName} ${year}`;
        nextStart = new Date(bucketStart.getFullYear(), bucketStart.getMonth() + 1, 1);
        break;
      }

      case "QUARTER": {
        // For the first quarter, start from the period start date if it's not the 1st of a quarter
        let quarter: number;
        if (index === 0) {
          // First quarter starts from the period start date
          bucketStart = new Date(start);
          // But align the end to the end of the quarter
          quarter = Math.floor(start.getMonth() / 3);
          const quarterEnd = new Date(start.getFullYear(), (quarter + 1) * 3, 0);
          bucketEnd = quarterEnd < end ? quarterEnd : end;
        } else {
          // Subsequent quarters align to quarter boundaries
          quarter = Math.floor(current.getMonth() / 3);
          bucketStart = new Date(current.getFullYear(), quarter * 3, 1);
          bucketEnd = new Date(current.getFullYear(), (quarter + 1) * 3, 0);
        }
        bucketEnd.setHours(23, 59, 59, 999);
        if (bucketEnd > end) bucketEnd = end;
        if (bucketStart < start) bucketStart = new Date(start);
        // Use the quarter calculated above, or recalculate from bucketStart if needed
        quarter = Math.floor(bucketStart.getMonth() / 3);
        label = `Q${quarter + 1} ${bucketStart.getFullYear()}`;
        nextStart = new Date(bucketStart.getFullYear(), (quarter + 1) * 3, 1);
        break;
      }
    }

    // Only add bucket if it overlaps with our range
    if (bucketStart <= end && bucketEnd >= start) {
      // Clamp to actual range
      const actualStart = bucketStart < start ? start : bucketStart;
      const actualEnd = bucketEnd > end ? end : bucketEnd;

      // Update label with actual start date for WEEK buckets
      // For the last week, show the end date if it's extended to period end
      let finalLabel = label;
      if (bucketType === "WEEK" && label.startsWith("Week ")) {
        const weekNum = label.match(/\d+/)?.[0] || (index + 1).toString();
        const periodEndDay = formatLocalDate(end);
        const actualEndDay = formatLocalDate(actualEnd);
        const actualStartDay = formatLocalDate(actualStart);
        
        // Check if this is the last week by seeing if next week would be beyond period end
        const nextWeekStartDay = formatLocalDate(nextStart);
        const isLastWeek = nextWeekStartDay > periodEndDay;
        
        // If this is the last week and it extends to period end (and end is different from start), show end date
        if (isLastWeek && actualEndDay === periodEndDay && actualEndDay !== actualStartDay) {
          const endMonthName = monthNames[actualEnd.getMonth()];
          const endDay = actualEnd.getDate();
          finalLabel = `Week ${weekNum} (${endMonthName} ${endDay})`;
        } else {
          // Normal week, show start date
          const monthName = monthNames[actualStart.getMonth()];
          const day = actualStart.getDate();
          finalLabel = `Week ${weekNum} (${monthName} ${day})`;
        }
      }

      buckets.push({
        type: bucketType,
        startDate: formatLocalDate(actualStart),
        endDate: formatLocalDate(actualEnd),
        label: finalLabel,
        index: index++,
      });
    }

    current = nextStart;
    
    // Prevent infinite loop
    if (current > end) {
      // Before breaking, ensure the last bucket includes the end date
      // This ensures the last day of the period is always included
      if (buckets.length > 0) {
        const lastBucket = buckets[buckets.length - 1];
        const lastBucketEndDate = parseLocalDate(lastBucket.endDate);
        const endDateOnly = parseLocalDate(dateRange.endDate);
        
        // Compare dates at day level (ignore time)
        const lastBucketEndDay = formatLocalDate(lastBucketEndDate);
        const periodEndDay = formatLocalDate(endDateOnly);
        
        // If the last bucket doesn't include the end date, extend it or create a final bucket
        if (lastBucketEndDay < periodEndDay) {
          // Extend the last bucket to include the end date
          buckets[buckets.length - 1] = {
            ...lastBucket,
            endDate: periodEndDay,
          };
        }
      }
      break;
    }
  }

  return buckets;
}

/**
 * Align buckets by relative index (for comparison overlays)
 * Returns aligned buckets where index 0 of current aligns with index 0 of comparison
 */
export function alignBucketsByIndex(
  currentBuckets: TimeBucket[],
  comparisonBuckets: TimeBucket[]
): { current: TimeBucket[]; comparison: TimeBucket[] } {
  const maxLength = Math.max(currentBuckets.length, comparisonBuckets.length);
  const alignedCurrent: TimeBucket[] = [];
  const alignedComparison: TimeBucket[] = [];

  for (let i = 0; i < maxLength; i++) {
    if (i < currentBuckets.length) {
      alignedCurrent.push(currentBuckets[i]);
    } else {
      // Create empty bucket for current
      alignedCurrent.push({
        type: currentBuckets[0]?.type || "MONTH",
        startDate: "",
        endDate: "",
        label: `Period ${i + 1}`,
        index: i,
      });
    }

    if (i < comparisonBuckets.length) {
      alignedComparison.push(comparisonBuckets[i]);
    } else {
      // Create empty bucket for comparison
      alignedComparison.push({
        type: comparisonBuckets[0]?.type || "MONTH",
        startDate: "",
        endDate: "",
        label: `Period ${i + 1}`,
        index: i,
      });
    }
  }

  return { current: alignedCurrent, comparison: alignedComparison };
}

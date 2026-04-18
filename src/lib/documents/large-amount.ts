const ABS_CAP_AED = 1_000_000;

/**
 * Threshold for “unusually large” amounts: min(1_000_000 AED, 100 × 90-day average posted transaction amount).
 * Returns null if average cannot be computed (treated as cap-only in callers).
 */
export function unusuallyLargeThreshold(average90DayPostedAmount: number | null): number {
  if (average90DayPostedAmount == null || average90DayPostedAmount <= 0) {
    return ABS_CAP_AED;
  }
  return Math.min(ABS_CAP_AED, average90DayPostedAmount * 100);
}

export function isUnusuallyLargeAmount(
  amountAbs: number,
  average90DayPostedAmount: number | null,
): boolean {
  const t = unusuallyLargeThreshold(average90DayPostedAmount);
  return amountAbs > t;
}

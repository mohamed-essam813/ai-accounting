import { round2 } from "@/lib/posting/posting-engine";
import { differenceInCalendarDays, endOfMonth, getDate, parseISO, startOfDay } from "date-fns";

export type AssetForDepr = {
  id: string;
  cost: number;
  useful_life_months: number;
  residual_value: number;
  depreciation_method: string;
  /** First day the asset is allowed to be depreciated (inclusive) */
  start_depreciation_date: string | null;
  disposed_at: string | null;
  purchase_date: string;
};

export type DepreciationState = {
  period_start: string;
  accumulated_depreciation: number;
  net_book_value: number;
};

const PERIOD = /^(\d{4})-(\d{2})-01$/;

function periodYyyyMm(periodStart: string): string {
  return periodStart.slice(0, 7);
}

function monthKeyFromIso(d: string): string {
  return d.slice(0, 7);
}

export function isDisposedInAccrualPeriod(periodStart: string, disposedAt: string | null | undefined): boolean {
  if (!disposedAt) return false;
  return monthKeyFromIso(disposedAt) === periodYyyyMm(periodStart);
}

/**
 * If accrual period (calendar month) is before the first month in which
 * depreciation starts, no depreciation.
 * Same YYYY-MM as `depStart` is the (possibly prorated) first accrual month.
 */
function isBeforeDepreciationCommences(periodStart: string, depStart: string | null | undefined): boolean {
  if (!depStart) return true;
  if (monthKeyFromIso(periodStart) < monthKeyFromIso(depStart)) return true;
  if (monthKeyFromIso(periodStart) > monthKeyFromIso(depStart)) return false;
  return false; // first accrual month
}

function endOfAccrualMonth(periodStart: string): string {
  const s = periodStart;
  if (!PERIOD.test(s)) {
    return s;
  }
  const p = parseISO(s);
  return endOfMonth(p).toISOString().slice(0, 10);
}

/**
 * Base monthly amount for straight line (one full month).
 */
export function straightLineMonthlyBase(cost: number, residual: number, usefulLifeMonths: number): number {
  if (usefulLifeMonths <= 0) return 0;
  return round2((round2(cost) - round2(residual)) / usefulLifeMonths);
}

/**
 * For the first accrual month, prorate if depreciation starts after the 1st of that month.
 */
function firstPeriodFactor(depStart: string, periodStart: string): { factor: number; inFirstMonth: boolean } {
  const pStart = startOfDay(parseISO(periodStart));
  const dep = startOfDay(parseISO(depStart));
  if (pStart.getFullYear() === dep.getFullYear() && pStart.getMonth() === dep.getMonth()) {
    const last = parseISO(endOfAccrualMonth(periodStart));
    const dayCount = last.getDate();
    if (getDate(dep) === 1) {
      return { factor: 1, inFirstMonth: true };
    }
    const days = differenceInCalendarDays(last, dep) + 1;
    return { factor: Math.max(0, days / dayCount), inFirstMonth: true };
  }
  return { factor: 1, inFirstMonth: false };
}

/**
 * One period of straight-line depreciation, capped to depreciable cost and
 * the tail remainder on the last period.
 */
export function computeStraightLineForPeriod(
  asset: AssetForDepr,
  periodStart: string,
  previousAccum: number,
): { amount: number; reason?: string } {
  if (asset.disposed_at && isDisposedInAccrualPeriod(periodStart, asset.disposed_at)) {
    return { amount: 0, reason: "No depreciation in the month of disposal" };
  }

  const startDep = asset.start_depreciation_date;
  if (isBeforeDepreciationCommences(periodStart, startDep)) {
    return { amount: 0, reason: "Not yet in service for depreciation" };
  }

  const depStart = startDep as string;

  const cap = round2(Math.max(0, round2(asset.cost) - round2(asset.residual_value)));
  if (cap <= 0) {
    return { amount: 0, reason: "No depreciable cost" };
  }
  if (round2(previousAccum) >= cap - 0.005) {
    return { amount: 0, reason: "Fully depreciated" };
  }

  const life = Math.max(1, asset.useful_life_months);
  const monthly = straightLineMonthlyBase(asset.cost, asset.residual_value, life);
  if (monthly <= 0) {
    return { amount: 0, reason: "No monthly depreciation" };
  }

  const { factor, inFirstMonth } = firstPeriodFactor(depStart, periodStart);
  const raw = round2(monthly * (inFirstMonth ? factor : 1));
  const remaining = round2(Math.max(0, cap - round2(previousAccum)));
  const dep = round2(Math.min(remaining, raw));
  return { amount: dep < 0.01 ? 0 : dep };
}

export function monthsBetweenPurchaseAndAsOf(purchaseDate: string, asOf: Date): number {
  const a = startOfDay(parseISO(purchaseDate));
  return Math.max(0, (asOf.getFullYear() - a.getFullYear()) * 12 + (asOf.getMonth() - a.getMonth()));
}

export function isStraightLine(method: string | undefined | null): boolean {
  return method === "straight_line" || !method;
}

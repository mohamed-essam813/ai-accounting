/**
 * AR/AP Ageing Reports Data Access
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import { convertCurrency, getTenantBaseCurrency } from "@/lib/utils/currency-conversion";

async function convertAmount(
  n: number,
  base: string,
  target: string,
  date: string,
  tenantId: string,
): Promise<number> {
  if (base.toUpperCase() === target.toUpperCase()) return n;
  return convertCurrency(n, base, target, date, tenantId);
}

export interface ARAgeingItem {
  tenant_id: string;
  customer_name: string;
  invoice_number: string;
  entry_date: string;
  due_date: string;
  outstanding_amount: number;
  days_overdue: number;
  current_0_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
}

export interface ARAgeingSummary {
  tenant_id: string;
  customer_name: string;
  total_current: number;
  total_31_60: number;
  total_61_90: number;
  total_90_plus: number;
  total_outstanding: number;
}

export interface APAgeingItem {
  tenant_id: string;
  vendor_name: string;
  bill_number: string;
  entry_date: string;
  due_date: string;
  outstanding_amount: number;
  days_overdue: number;
  current_0_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
}

export interface APAgeingSummary {
  tenant_id: string;
  vendor_name: string;
  total_current: number;
  total_31_60: number;
  total_61_90: number;
  total_90_plus: number;
  total_outstanding: number;
}

/**
 * @param targetCurrency - Optional. When set with asOfDate, amounts are converted from base.
 * @param asOfDate - Optional. Date used for FX.
 */
export async function getARAgeing(
  targetCurrency?: string,
  asOfDate?: string,
): Promise<ARAgeingItem[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();

  const view = supabase.from("v_ar_ageing") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: { ascending?: boolean }) => Promise<{
          data: ARAgeingItem[] | null;
          error: unknown;
        }>;
      };
    };
  };

  const { data, error } = await view
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("days_overdue", { ascending: false });

  if (error) {
    console.error("Failed to fetch AR ageing:", error);
    return [];
  }

  const rows = (data || []).map((row) => ({
    ...row,
    outstanding_amount: Number(row.outstanding_amount),
    days_overdue: Number(row.days_overdue),
    current_0_30: Number(row.current_0_30),
    days_31_60: Number(row.days_31_60),
    days_61_90: Number(row.days_61_90),
    days_90_plus: Number(row.days_90_plus),
  }));

  if (!targetCurrency || !asOfDate) return rows;

  const base = await getTenantBaseCurrency(user.tenant.id);
  const conv = (n: number) => convertAmount(n, base, targetCurrency, asOfDate, user.tenant!.id);

  const out: ARAgeingItem[] = [];
  for (const r of rows) {
    const [oa, c0, d31, d61, d90] = await Promise.all([
      conv(r.outstanding_amount),
      conv(r.current_0_30),
      conv(r.days_31_60),
      conv(r.days_61_90),
      conv(r.days_90_plus),
    ]);
    out.push({
      ...r,
      outstanding_amount: oa,
      current_0_30: c0,
      days_31_60: d31,
      days_61_90: d61,
      days_90_plus: d90,
    });
  }
  return out;
}

/**
 * @param targetCurrency - Optional. When set with asOfDate, amounts are converted from base.
 * @param asOfDate - Optional. Date used for FX.
 */
export async function getARAgeingSummary(
  targetCurrency?: string,
  asOfDate?: string,
): Promise<ARAgeingSummary[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();

  const view = supabase.from("v_ar_ageing_summary") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: { ascending?: boolean }) => Promise<{
          data: ARAgeingSummary[] | null;
          error: unknown;
        }>;
      };
    };
  };

  const { data, error } = await view
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("total_outstanding", { ascending: false });

  if (error) {
    console.error("Failed to fetch AR ageing summary:", error);
    return [];
  }

  const rows = (data || []).map((row) => ({
    ...row,
    total_current: Number(row.total_current),
    total_31_60: Number(row.total_31_60),
    total_61_90: Number(row.total_61_90),
    total_90_plus: Number(row.total_90_plus),
    total_outstanding: Number(row.total_outstanding),
  }));

  if (!targetCurrency || !asOfDate) return rows;

  const base = await getTenantBaseCurrency(user.tenant.id);
  const conv = (n: number) => convertAmount(n, base, targetCurrency, asOfDate, user.tenant!.id);

  const out: ARAgeingSummary[] = [];
  for (const r of rows) {
    const [tc, t31, t61, t90, to] = await Promise.all([
      conv(r.total_current),
      conv(r.total_31_60),
      conv(r.total_61_90),
      conv(r.total_90_plus),
      conv(r.total_outstanding),
    ]);
    out.push({
      ...r,
      total_current: tc,
      total_31_60: t31,
      total_61_90: t61,
      total_90_plus: t90,
      total_outstanding: to,
    });
  }
  return out;
}

/**
 * @param targetCurrency - Optional. When set with asOfDate, amounts are converted from base.
 * @param asOfDate - Optional. Date used for FX.
 */
export async function getAPAgeing(
  targetCurrency?: string,
  asOfDate?: string,
): Promise<APAgeingItem[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();

  const view = supabase.from("v_ap_ageing") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: { ascending?: boolean }) => Promise<{
          data: APAgeingItem[] | null;
          error: unknown;
        }>;
      };
    };
  };

  const { data, error } = await view
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("days_overdue", { ascending: false });

  if (error) {
    console.error("Failed to fetch AP ageing:", error);
    return [];
  }

  const rows = (data || []).map((row) => ({
    ...row,
    outstanding_amount: Number(row.outstanding_amount),
    days_overdue: Number(row.days_overdue),
    current_0_30: Number(row.current_0_30),
    days_31_60: Number(row.days_31_60),
    days_61_90: Number(row.days_61_90),
    days_90_plus: Number(row.days_90_plus),
  }));

  if (!targetCurrency || !asOfDate) return rows;

  const base = await getTenantBaseCurrency(user.tenant.id);
  const conv = (n: number) => convertAmount(n, base, targetCurrency, asOfDate, user.tenant!.id);

  const out: APAgeingItem[] = [];
  for (const r of rows) {
    const [oa, c0, d31, d61, d90] = await Promise.all([
      conv(r.outstanding_amount),
      conv(r.current_0_30),
      conv(r.days_31_60),
      conv(r.days_61_90),
      conv(r.days_90_plus),
    ]);
    out.push({
      ...r,
      outstanding_amount: oa,
      current_0_30: c0,
      days_31_60: d31,
      days_61_90: d61,
      days_90_plus: d90,
    });
  }
  return out;
}

/**
 * @param targetCurrency - Optional. When set with asOfDate, amounts are converted from base.
 * @param asOfDate - Optional. Date used for FX.
 */
export async function getAPAgeingSummary(
  targetCurrency?: string,
  asOfDate?: string,
): Promise<APAgeingSummary[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();

  const view = supabase.from("v_ap_ageing_summary") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: { ascending?: boolean }) => Promise<{
          data: APAgeingSummary[] | null;
          error: unknown;
        }>;
      };
    };
  };

  const { data, error } = await view
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("total_outstanding", { ascending: false });

  if (error) {
    console.error("Failed to fetch AP ageing summary:", error);
    return [];
  }

  const rows = (data || []).map((row) => ({
    ...row,
    total_current: Number(row.total_current),
    total_31_60: Number(row.total_31_60),
    total_61_90: Number(row.total_61_90),
    total_90_plus: Number(row.total_90_plus),
    total_outstanding: Number(row.total_outstanding),
  }));

  if (!targetCurrency || !asOfDate) return rows;

  const base = await getTenantBaseCurrency(user.tenant.id);
  const conv = (n: number) => convertAmount(n, base, targetCurrency, asOfDate, user.tenant!.id);

  const out: APAgeingSummary[] = [];
  for (const r of rows) {
    const [tc, t31, t61, t90, to] = await Promise.all([
      conv(r.total_current),
      conv(r.total_31_60),
      conv(r.total_61_90),
      conv(r.total_90_plus),
      conv(r.total_outstanding),
    ]);
    out.push({
      ...r,
      total_current: tc,
      total_31_60: t31,
      total_61_90: t61,
      total_90_plus: t90,
      total_outstanding: to,
    });
  }
  return out;
}


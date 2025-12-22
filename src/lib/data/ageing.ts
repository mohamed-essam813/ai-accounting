/**
 * AR/AP Ageing Reports Data Access
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";

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

export async function getARAgeing(): Promise<ARAgeingItem[]> {
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

  return (data || []).map((row) => ({
    ...row,
    outstanding_amount: Number(row.outstanding_amount),
    days_overdue: Number(row.days_overdue),
    current_0_30: Number(row.current_0_30),
    days_31_60: Number(row.days_31_60),
    days_61_90: Number(row.days_61_90),
    days_90_plus: Number(row.days_90_plus),
  }));
}

export async function getARAgeingSummary(): Promise<ARAgeingSummary[]> {
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

  return (data || []).map((row) => ({
    ...row,
    total_current: Number(row.total_current),
    total_31_60: Number(row.total_31_60),
    total_61_90: Number(row.total_61_90),
    total_90_plus: Number(row.total_90_plus),
    total_outstanding: Number(row.total_outstanding),
  }));
}

export async function getAPAgeing(): Promise<APAgeingItem[]> {
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

  return (data || []).map((row) => ({
    ...row,
    outstanding_amount: Number(row.outstanding_amount),
    days_overdue: Number(row.days_overdue),
    current_0_30: Number(row.current_0_30),
    days_31_60: Number(row.days_31_60),
    days_61_90: Number(row.days_61_90),
    days_90_plus: Number(row.days_90_plus),
  }));
}

export async function getAPAgeingSummary(): Promise<APAgeingSummary[]> {
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

  return (data || []).map((row) => ({
    ...row,
    total_current: Number(row.total_current),
    total_31_60: Number(row.total_31_60),
    total_61_90: Number(row.total_61_90),
    total_90_plus: Number(row.total_90_plus),
    total_outstanding: Number(row.total_outstanding),
  }));
}


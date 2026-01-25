import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import { convertCurrency, getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import type { Database } from "../database.types";

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

type ProfitAndLoss = Database["public"]["Views"]["v_profit_and_loss"]["Row"];
type BalanceSheet = Database["public"]["Views"]["v_balance_sheet"]["Row"];
type TrialBalance = Database["public"]["Views"]["v_trial_balance"]["Row"];

export async function getProfitAndLoss(): Promise<ProfitAndLoss | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("v_profit_and_loss")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getBalanceSheet(): Promise<BalanceSheet | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("v_balance_sheet")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * @param targetCurrency - Optional. When set with asOfDate, amounts are converted from base.
 * @param asOfDate - Optional. Date used for FX.
 */
export async function getTrialBalance(
  targetCurrency?: string,
  asOfDate?: string,
): Promise<TrialBalance[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("v_trial_balance")
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .order("code");

  if (error) throw error;
  const rows = data ?? [];

  if (!targetCurrency || !asOfDate) return rows;

  const base = await getTenantBaseCurrency(user.tenant.id);
  const conv = (n: number) => convertAmount(n, base, targetCurrency, asOfDate, user.tenant!.id);

  const out: TrialBalance[] = [];
  for (const r of rows) {
    const debit = Number(r.total_debit ?? 0);
    const credit = Number(r.total_credit ?? 0);
    const [d, c] = await Promise.all([conv(debit), conv(credit)]);
    out.push({ ...r, total_debit: d, total_credit: c } as TrialBalance);
  }
  return out;
}

type CashFlow = { tenant_id: string; net_cash_flow: number | null };
type JournalLedger = {
  tenant_id: string;
  entry_id: string;
  line_id: string;
  date: string;
  description: string;
  status: string;
  created_at: string;
  account_code: string;
  account_name: string;
  debit: number | null;
  credit: number | null;
  memo: string | null;
};
type VATReport = {
  tenant_id: string;
  vat_output_tax: number | null;
  vat_input_tax: number | null;
  vat_payable: number | null;
};

export async function getCashFlow(): Promise<CashFlow | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  // Type assertion for new view (not yet in database types)
  const table = (supabase as any).from("v_cash_flow") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: CashFlow | null; error: unknown }>;
      };
    };
  };
  const { data, error } = await table.select("*").eq("tenant_id", user.tenant.id).maybeSingle();

  if (error) throw error;
  return data;
}

export async function getJournalLedger(startDate?: string, endDate?: string, currency?: string): Promise<JournalLedger[]> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  // Type assertion for new view (not yet in database types)
  let query = (supabase as any).from("v_journal_ledger") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        gte?: (column: string, value: string) => {
          lte?: (column: string, value: string) => {
            eq?: (column: string, value: string) => {
              order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
            };
            order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
          };
          eq?: (column: string, value: string) => {
            order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
          };
          order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
        };
        lte?: (column: string, value: string) => {
          eq?: (column: string, value: string) => {
            order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
          };
          order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
        };
        eq?: (column: string, value: string) => {
          order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
        };
        order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: JournalLedger[] | null; error: unknown }>;
      };
    };
  };

  let q: any = query.select("*").eq("tenant_id", user.tenant.id);
  if (startDate && q.gte) {
    q = q.gte("date", startDate);
  }
  if (endDate && q.lte) {
    q = q.lte("date", endDate);
  }
  // Note: Currency filtering will work once v_journal_ledger view includes transaction_currency
  // For now, we filter in application layer if currency is provided
  const { data, error } = await q.order("date", { ascending: false });

  if (error) throw error;
  
  let result = data ?? [];
  
  // Currency parameter is for conversion, not filtering
  // All journal entries are returned - currency conversion happens at display layer
  // We need to join with journal_entries to get currency info for conversion
  if (currency && result.length > 0) {
    const entryIds = new Set(
      result.map((r: any) => r.entry_id).filter((id: any): id is string => typeof id === "string")
    );
    
    if (entryIds.size > 0) {
      const { data: entries } = await supabase
        .from("journal_entries")
        .select("id, transaction_currency, base_currency, date")
        .in("id", Array.from(entryIds) as string[])
        .eq("tenant_id", user.tenant.id);
      
      const currencyMap = new Map(
        (entries ?? []).map((e: any) => [
          e.id,
          {
            transactionCurrency: e.transaction_currency,
            baseCurrency: e.base_currency,
            date: e.date,
          },
        ])
      );
      
      // Attach currency info to each ledger entry for conversion
      result = result.map((r: any) => ({
        ...r,
        _currencyInfo: currencyMap.get(r.entry_id),
      }));
    }
  }
  
  return result;
}

/**
 * @param targetCurrency - Optional. When set with asOfDate, amounts are converted from base.
 * @param asOfDate - Optional. Date used for FX.
 */
export async function getVATReport(
  targetCurrency?: string,
  asOfDate?: string,
): Promise<VATReport | null> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const table = (supabase as any).from("v_vat_report") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: VATReport | null; error: unknown }>;
      };
    };
  };
  const { data, error } = await table.select("*").eq("tenant_id", user.tenant.id).maybeSingle();

  if (error) throw error;
  if (!data) return null;

  if (!targetCurrency || !asOfDate) return data;

  const base = await getTenantBaseCurrency(user.tenant.id);
  const conv = (n: number) => convertAmount(n, base, targetCurrency, asOfDate, user.tenant!.id);
  const [outTax, inTax, payable] = await Promise.all([
    conv(Number(data.vat_output_tax ?? 0)),
    conv(Number(data.vat_input_tax ?? 0)),
    conv(Number(data.vat_payable ?? 0)),
  ]);
  return {
    ...data,
    vat_output_tax: outTax,
    vat_input_tax: inTax,
    vat_payable: payable,
  };
}


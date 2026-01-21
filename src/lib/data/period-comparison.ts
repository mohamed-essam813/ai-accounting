/**
 * Period Comparison Data Access
 * Excel Elimination Doctrine: Native Comparisons
 * 
 * Fetches financial data for different periods to enable comparisons
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./users";
import { getProfitAndLoss, getCashFlow } from "./reports";
import type { Database } from "@/lib/database.types";
import type { DateRange } from "@/lib/utils/period-comparison";

type TrialBalanceView = Database["public"]["Views"]["v_trial_balance"]["Row"];

export interface PeriodFinancialData {
  revenue: number;
  expenses: number;
  netIncome: number;
  cashBalance: number;
  receivables: number;
  payables: number;
  cashFlow: number;
}

/**
 * Get financial data for a specific date range
 */
export async function getPeriodFinancialData(
  dateRange?: DateRange,
  targetCurrency?: string,
): Promise<PeriodFinancialData> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return {
      revenue: 0,
      expenses: 0,
      netIncome: 0,
      cashBalance: 0,
      receivables: 0,
      payables: 0,
      cashFlow: 0,
    };
  }

  const supabase = await createServerSupabaseClient();

  // If date range provided, we need to query journal entries filtered by date
  // For now, we'll use the existing views which are cumulative (YTD)
  // In production, you'd create date-filtered views or query journal entries directly

  // Get P&L (this is cumulative, so for period comparison we'd need date filtering)
  const pnl = await getProfitAndLoss();
  const cashFlowData = await getCashFlow();

  // Get balances (these are current balances, not period-specific)
  const [cashBalance, receivables, payables] = await Promise.all([
    getCashBalanceForPeriod(dateRange),
    getReceivablesBalanceForPeriod(dateRange),
    getPayablesBalanceForPeriod(dateRange),
  ]);

  // For period-specific revenue/expenses, we'd need to query journal entries
  // For now, return current values (this will be enhanced with date filtering)
  const revenue = dateRange
    ? await getRevenueForPeriod(dateRange)
    : Number(pnl?.total_revenue ?? 0);
  const expenses = dateRange
    ? await getExpensesForPeriod(dateRange)
    : Number(pnl?.total_expense ?? 0);
  const netIncome = revenue - expenses;

  let finalRevenue = revenue;
  let finalExpenses = expenses;
  let finalNetIncome = netIncome;
  let finalCashBalance = cashBalance;
  let finalReceivables = receivables;
  let finalPayables = payables;
  let finalCashFlow = Number(cashFlowData?.net_cash_flow ?? 0);
  
  // Convert amounts if targetCurrency is provided
  if (targetCurrency && user?.tenant) {
    const { convertCurrency, getTenantBaseCurrency } = await import("@/lib/utils/currency-conversion");
    const baseCurrency = await getTenantBaseCurrency(user.tenant.id);
    const conversionDate = dateRange?.endDate || new Date().toISOString().split("T")[0];
    
    if (baseCurrency.toUpperCase() !== targetCurrency.toUpperCase()) {
      [finalRevenue, finalExpenses, finalNetIncome, finalCashBalance, finalReceivables, finalPayables, finalCashFlow] = await Promise.all([
        convertCurrency(revenue, baseCurrency, targetCurrency, conversionDate, user.tenant.id),
        convertCurrency(expenses, baseCurrency, targetCurrency, conversionDate, user.tenant.id),
        convertCurrency(netIncome, baseCurrency, targetCurrency, conversionDate, user.tenant.id),
        convertCurrency(cashBalance, baseCurrency, targetCurrency, conversionDate, user.tenant.id),
        convertCurrency(receivables, baseCurrency, targetCurrency, conversionDate, user.tenant.id),
        convertCurrency(payables, baseCurrency, targetCurrency, conversionDate, user.tenant.id),
        convertCurrency(finalCashFlow, baseCurrency, targetCurrency, conversionDate, user.tenant.id),
      ]);
    }
  }
  
  return {
    revenue: finalRevenue,
    expenses: finalExpenses,
    netIncome: finalNetIncome,
    cashBalance: finalCashBalance,
    receivables: finalReceivables,
    payables: finalPayables,
    cashFlow: finalCashFlow,
  };
}

/**
 * Get cash balance for a specific period
 * (Calculates from journal entries within date range)
 */
async function getCashBalanceForPeriod(
  dateRange?: DateRange,
): Promise<number> {
  const user = await getCurrentUser();
  if (!user?.tenant) return 0;

  const supabase = await createServerSupabaseClient();

  // Get cash account ID
  const { data: cashAccount } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", user.tenant.id)
    .eq("code", "1000")
    .maybeSingle();

  if (!cashAccount) return 0;

  // Query journal lines for cash account
  let query = supabase
    .from("journal_lines")
    .select("debit, credit, entry_id, journal_entries!inner(date, tenant_id, status)")
    .eq("account_id", cashAccount.id)
    .eq("journal_entries.tenant_id", user.tenant.id)
    .eq("journal_entries.status", "posted");

  if (dateRange) {
    query = query
      .gte("journal_entries.date", dateRange.startDate)
      .lte("journal_entries.date", dateRange.endDate);
  }

  const { data: lines } = await query;

  if (!lines) return 0;

  const balance = lines.reduce(
    (sum, line) => sum + Number(line.debit) - Number(line.credit),
    0,
  );

  return balance;
}

/**
 * Get receivables balance for a specific period
 */
async function getReceivablesBalanceForPeriod(
  dateRange?: DateRange,
): Promise<number> {
  const user = await getCurrentUser();
  if (!user?.tenant) return 0;

  const supabase = await createServerSupabaseClient();

  const { data: receivablesAccount } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", user.tenant.id)
    .eq("code", "1100")
    .maybeSingle();

  if (!receivablesAccount) return 0;

  let query = supabase
    .from("journal_lines")
    .select("debit, credit, entry_id, journal_entries!inner(date, tenant_id, status)")
    .eq("account_id", receivablesAccount.id)
    .eq("journal_entries.tenant_id", user.tenant.id)
    .eq("journal_entries.status", "posted");

  if (dateRange) {
    query = query
      .gte("journal_entries.date", dateRange.startDate)
      .lte("journal_entries.date", dateRange.endDate);
  }

  const { data: lines } = await query;

  if (!lines) return 0;

  return lines.reduce(
    (sum, line) => sum + Number(line.debit) - Number(line.credit),
    0,
  );
}

/**
 * Get payables balance for a specific period
 */
async function getPayablesBalanceForPeriod(
  dateRange?: DateRange,
): Promise<number> {
  const user = await getCurrentUser();
  if (!user?.tenant) return 0;

  const supabase = await createServerSupabaseClient();

  const { data: payablesAccount } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", user.tenant.id)
    .eq("code", "2000")
    .maybeSingle();

  if (!payablesAccount) return 0;

  let query = supabase
    .from("journal_lines")
    .select("debit, credit, entry_id, journal_entries!inner(date, tenant_id, status)")
    .eq("account_id", payablesAccount.id)
    .eq("journal_entries.tenant_id", user.tenant.id)
    .eq("journal_entries.status", "posted");

  if (dateRange) {
    query = query
      .gte("journal_entries.date", dateRange.startDate)
      .lte("journal_entries.date", dateRange.endDate);
  }

  const { data: lines } = await query;

  if (!lines) return 0;

  return lines.reduce(
    (sum, line) => sum + Number(line.credit) - Number(line.debit),
    0,
  );
}

/**
 * Get revenue for a specific period
 */
async function getRevenueForPeriod(dateRange: DateRange): Promise<number> {
  const user = await getCurrentUser();
  if (!user?.tenant) return 0;

  const supabase = await createServerSupabaseClient();

  // Get all revenue accounts (type = 'revenue')
  const { data: revenueAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", user.tenant.id)
    .eq("type", "revenue");

  if (!revenueAccounts || revenueAccounts.length === 0) return 0;

  const accountIds = revenueAccounts.map((acc) => acc.id);

  // Sum credits to revenue accounts in the period
  const { data: lines } = await supabase
    .from("journal_lines")
    .select("credit, entry_id, journal_entries!inner(date, tenant_id, status)")
    .in("account_id", accountIds)
    .eq("journal_entries.tenant_id", user.tenant.id)
    .eq("journal_entries.status", "posted")
    .gte("journal_entries.date", dateRange.startDate)
    .lte("journal_entries.date", dateRange.endDate);

  if (!lines) return 0;

  return lines.reduce((sum, line) => sum + Number(line.credit), 0);
}

/**
 * Get expenses for a specific period
 */
async function getExpensesForPeriod(dateRange: DateRange): Promise<number> {
  const user = await getCurrentUser();
  if (!user?.tenant) return 0;

  const supabase = await createServerSupabaseClient();

  // Get all expense accounts (type = 'expense')
  const { data: expenseAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", user.tenant.id)
    .eq("type", "expense");

  if (!expenseAccounts || expenseAccounts.length === 0) return 0;

  const accountIds = expenseAccounts.map((acc) => acc.id);

  // Sum debits to expense accounts in the period
  const { data: lines } = await supabase
    .from("journal_lines")
    .select("debit, entry_id, journal_entries!inner(date, tenant_id, status)")
    .in("account_id", accountIds)
    .eq("journal_entries.tenant_id", user.tenant.id)
    .eq("journal_entries.status", "posted")
    .gte("journal_entries.date", dateRange.startDate)
    .lte("journal_entries.date", dateRange.endDate);

  if (!lines) return 0;

  return lines.reduce((sum, line) => sum + Number(line.debit), 0);
}


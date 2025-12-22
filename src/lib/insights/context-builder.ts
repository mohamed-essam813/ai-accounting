/**
 * Build Insight Context from Journal Entry
 * Extracts financial deltas and previous state for insight generation
 */

import type { InsightContext } from "./types";
import { listAccounts } from "@/lib/data/accounts";
import { getProfitAndLoss, getBalanceSheet } from "@/lib/data/reports";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import type { Database } from "@/lib/database.types";

type JournalEntryRow = Database["public"]["Tables"]["journal_entries"]["Row"];
type JournalLineRow = Database["public"]["Tables"]["journal_lines"]["Row"];
type DraftRow = Database["public"]["Tables"]["drafts"]["Row"];

export async function buildInsightContext(
  journalEntryId: string,
  draftId?: string,
): Promise<InsightContext & { tenant_id: string }> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const supabase = await createServerSupabaseClient();

  // Fetch journal entry
  const entryTable = supabase.from("journal_entries") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: JournalEntryRow | null; error: unknown }>;
        };
      };
    };
  };

  const { data: entry, error: entryError } = await entryTable
    .select("*")
    .eq("tenant_id", user.tenant.id)
    .eq("id", journalEntryId)
    .maybeSingle();

  if (entryError || !entry) {
    throw new Error("Journal entry not found");
  }

  // Fetch journal lines
  const linesTable = supabase.from("journal_lines") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string) => Promise<{ data: JournalLineRow[] | null; error: unknown }>;
      };
    };
  };

  const { data: lines, error: linesError } = await linesTable
    .select("*")
    .eq("entry_id", journalEntryId)
    .order("debit");

  if (linesError) {
    throw linesError;
  }

  // Fetch accounts
  const accounts = await listAccounts();
  const accountMap = new Map(accounts.map((acc) => [acc.id, acc]));

  // Build accounts_affected array
  const accountsAffected = (lines || []).map((line) => {
    const account = accountMap.get(line.account_id);
    return {
      account_id: line.account_id,
      account_name: account?.name || "Unknown",
      account_code: account?.code || "",
      account_type: account?.type || "asset",
      debit: Number(line.debit),
      credit: Number(line.credit),
    };
  });

  // Get draft data if available
  let intent: string | undefined;
  let amount = 0;
  let currency = "USD";
  let counterparty: string | null = null;
  let description = entry.description;

  if (draftId) {
    const draftTable = supabase.from("drafts") as unknown as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: DraftRow | null; error: unknown }>;
          };
        };
      };
    };

    const { data: draft } = await draftTable
      .select("*")
      .eq("tenant_id", user.tenant.id)
      .eq("id", draftId)
      .maybeSingle();

    if (draft) {
      intent = draft.intent;
      const dataJson = draft.data_json as {
        amount?: number;
        currency?: string;
        counterparty?: string;
        description?: string;
      };
      amount = dataJson.amount || 0;
      currency = dataJson.currency || "USD";
      counterparty = dataJson.counterparty || null;
      description = dataJson.description || entry.description;
    }
  }

  // Calculate amount from journal lines if not from draft
  if (amount === 0 && lines && lines.length > 0) {
    // Sum debits or credits (whichever is non-zero)
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    amount = Math.max(totalDebit, totalCredit);
  }

  // Calculate financial deltas
  const financialDelta = calculateFinancialDelta(accountsAffected, accounts);

  // Get previous state (before this transaction)
  const previousState = await getPreviousFinancialState(user.tenant.id, entry.date);

  return {
    tenant_id: user.tenant.id,
    journal_entry_id: journalEntryId,
    draft_id: draftId,
    intent,
    amount,
    currency,
    counterparty,
    date: entry.date,
    description,
    accounts_affected: accountsAffected,
    financial_delta: financialDelta,
    previous_state: previousState,
  };
}

function calculateFinancialDelta(
  accountsAffected: InsightContext["accounts_affected"],
  allAccounts: Array<{ id: string; type: string }>,
): InsightContext["financial_delta"] {
  const accountTypeMap = new Map(allAccounts.map((acc) => [acc.id, acc.type]));

  const delta: InsightContext["financial_delta"] = {};

  for (const account of accountsAffected) {
    const accountType = accountTypeMap.get(account.account_id);
    const netChange = account.debit - account.credit;

    switch (accountType) {
      case "revenue":
        delta.revenue_change = (delta.revenue_change || 0) + netChange;
        break;
      case "expense":
        delta.expense_change = (delta.expense_change || 0) + Math.abs(netChange);
        break;
      case "asset":
        if (account.account_code === "1000") {
          // Cash account
          delta.cash_change = (delta.cash_change || 0) + netChange;
        } else if (account.account_code === "1100") {
          // Accounts Receivable
          delta.receivable_change = (delta.receivable_change || 0) + netChange;
        }
        break;
      case "liability":
        if (account.account_code === "2000") {
          // Accounts Payable
          delta.payable_change = (delta.payable_change || 0) - netChange;
        } else if (account.account_code === "2100") {
          // VAT Payable
          delta.tax_change = (delta.tax_change || 0) - netChange;
        }
        break;
    }

    // Tax accounts
    if (account.account_code === "2100") {
      // VAT Output
      delta.tax_change = (delta.tax_change || 0) - netChange;
    } else if (account.account_code === "5100") {
      // VAT Input
      delta.tax_change = (delta.tax_change || 0) + netChange;
    }
  }

  return delta;
}

async function getPreviousFinancialState(
  tenantId: string,
  beforeDate: string,
): Promise<InsightContext["previous_state"]> {
  try {
    // Get P&L and Balance Sheet before this date
    // This is a simplified version - in production, you'd query with date filters
    const [pnl, balanceSheet] = await Promise.all([
      getProfitAndLoss(),
      getBalanceSheet(),
    ]);

    // Get cash balance from trial balance
    const supabase = await createServerSupabaseClient();
    const trialBalanceView = supabase.from("v_trial_balance") as unknown as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{
              data: { total_debit: number; total_credit: number } | null;
              error: unknown;
            }>;
          };
        };
      };
    };

    const { data: cashAccount } = await trialBalanceView
      .select("total_debit, total_credit")
      .eq("tenant_id", tenantId)
      .eq("code", "1000")
      .maybeSingle();

    const cashBalance =
      cashAccount && cashAccount.total_debit && cashAccount.total_credit
        ? Number(cashAccount.total_debit) - Number(cashAccount.total_credit)
        : 0;

    // Get receivables and payables (simplified - would need date filtering in production)
    const { data: receivablesAccount } = await trialBalanceView
      .select("total_debit, total_credit")
      .eq("tenant_id", tenantId)
      .eq("code", "1100")
      .maybeSingle();

    const totalReceivables =
      receivablesAccount && receivablesAccount.total_debit && receivablesAccount.total_credit
        ? Number(receivablesAccount.total_debit) - Number(receivablesAccount.total_credit)
        : 0;

    const { data: payablesAccount } = await trialBalanceView
      .select("total_debit, total_credit")
      .eq("tenant_id", tenantId)
      .eq("code", "2000")
      .maybeSingle();

    const totalPayables =
      payablesAccount && payablesAccount.total_credit && payablesAccount.total_debit
        ? Number(payablesAccount.total_credit) - Number(payablesAccount.total_debit)
        : 0;

    return {
      cash_balance: cashBalance,
      total_receivables: totalReceivables,
      total_payables: totalPayables,
      revenue_ytd: pnl?.total_revenue ? Number(pnl.total_revenue) : 0,
      expenses_ytd: pnl?.total_expense ? Number(pnl.total_expense) : 0,
    };
  } catch (error) {
    console.error("Failed to get previous financial state:", error);
    return {};
  }
}


/**
 * Insight Detail View - Cash
 * UX Composition Section 3: SCREEN 2 - Insight Detail View
 * Engineering Guide Section 2.2: Insight Screens (Understanding Zone)
 * 
 * Question It Answers: "Explain what's happening with cash and why it matters."
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { getCashFlow } from "@/lib/data/reports";
import type { Database } from "@/lib/database.types";

type TrialBalanceView = Database["public"]["Views"]["v_trial_balance"]["Row"];

export const revalidate = 60;

async function getCashBalance(): Promise<number> {
  const user = await getCurrentUser();
  if (!user?.tenant) return 0;

  const supabase = await createServerSupabaseClient();
  const trialBalanceView = supabase.from("v_trial_balance") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: TrialBalanceView | null;
            error: unknown;
          }>;
        };
      };
    };
  };

  const { data: cashAccount } = await trialBalanceView
    .select("total_debit, total_credit")
    .eq("tenant_id", user.tenant.id)
    .eq("code", "1000")
    .maybeSingle();

  if (!cashAccount || !cashAccount.total_debit || !cashAccount.total_credit) return 0;

  return Number(cashAccount.total_debit) - Number(cashAccount.total_credit);
}

export default async function CashInsightPage() {
  const [cashBalance, cashFlow] = await Promise.all([
    getCashBalance(),
    getCashFlow(),
  ]);

  const netCashFlow = Number(cashFlow?.net_cash_flow ?? 0);
  // Note: Operating/Investing/Financing breakdown not available in current view
  // Using net cash flow as approximation for operating activities
  const operatingCashFlow = netCashFlow;
  const investingCashFlow = 0;
  const financingCashFlow = 0;

  // Generate insight summary (UX Composition Section 3, Screen 2, Section A)
  let insightSummary = "";
  let severity: "calm" | "attention" | "urgent" = "calm";

  if (cashBalance < 0) {
    insightSummary = "Your cash balance is negative. Immediate action is required to avoid cash flow problems and potential operational disruption.";
    severity = "urgent";
  } else if (cashBalance < 5000) {
    insightSummary = "Your cash balance is low. Monitor closely and consider collecting receivables or reducing expenses to maintain operational flexibility.";
    severity = "attention";
  } else if (netCashFlow < 0) {
    insightSummary = "Cash flow is negative this period. More cash is going out than coming in, which may impact your ability to meet obligations.";
    severity = "attention";
  } else if (netCashFlow > 0 && operatingCashFlow > 0) {
    insightSummary = "Cash flow is positive, with healthy operating cash flow. Your business is generating cash from operations.";
    severity = "calm";
  } else {
    insightSummary = "Cash position is stable. Monitor cash flow trends to maintain financial flexibility.";
    severity = "calm";
  }

  return (
    <div className="space-y-6">
      {/* Section A: Insight Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cash Insight</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`p-4 rounded-lg ${
            severity === "urgent" ? "bg-red-50 border-red-200" :
            severity === "attention" ? "bg-yellow-50 border-yellow-200" :
            "bg-green-50 border-green-200"
          } border`}>
            <p className="text-base leading-relaxed text-foreground">{insightSummary}</p>
          </div>
        </CardContent>
      </Card>

      {/* Section B: Cash Position Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cash Position</CardTitle>
          <p className="text-sm text-muted-foreground">
            Current cash balance and cash flow breakdown
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CashMetric
              label="Current Balance"
              amount={cashBalance}
              trend={cashBalance < 0 ? "worsening" : cashBalance < 5000 ? "worsening" : "stable"}
            />
            <CashMetric
              label="Operating Flow"
              amount={operatingCashFlow}
              trend={operatingCashFlow > 0 ? "improving" : operatingCashFlow < 0 ? "worsening" : "stable"}
            />
            <CashMetric
              label="Investing Flow"
              amount={investingCashFlow}
              trend={investingCashFlow < 0 ? "stable" : investingCashFlow > 0 ? "improving" : "stable"}
            />
            <CashMetric
              label="Financing Flow"
              amount={financingCashFlow}
              trend={financingCashFlow > 0 ? "improving" : financingCashFlow < 0 ? "worsening" : "stable"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section C: Business Impact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Business Impact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ImpactItem
            title="Cash Availability"
            description={
              cashBalance < 0
                ? "Negative cash balance creates immediate operational risk. Urgent action required to restore positive balance."
                : cashBalance < 5000
                  ? "Low cash balance limits operational flexibility. Consider collecting receivables or securing short-term financing."
                  : "Adequate cash balance provides operational flexibility and ability to meet obligations."
            }
          />
          <ImpactItem
            title="Cash Flow Trend"
            description={
              netCashFlow < 0
                ? "Negative cash flow means more cash is going out than coming in. This trend may not be sustainable long-term."
                : netCashFlow > 0
                  ? "Positive cash flow indicates healthy cash generation from operations."
                  : "Cash flow is balanced. Monitor trends to ensure sustainability."
            }
          />
          <ImpactItem
            title="Operational Consequence"
            description={
              cashBalance < 5000 || netCashFlow < 0
                ? "Limited cash may impact ability to pay suppliers, meet obligations, or take advantage of opportunities."
                : "Sufficient cash provides ability to meet obligations and pursue growth opportunities."
            }
          />
        </CardContent>
      </Card>

      {/* Section D: Cash Flow Sources */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cash Flow Sources</CardTitle>
          <p className="text-sm text-muted-foreground">
            Breakdown of cash flow by category
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <CashFlowSource
              label="Operating Activities"
              amount={operatingCashFlow}
              description="Cash from day-to-day business operations"
            />
            <CashFlowSource
              label="Investing Activities"
              amount={investingCashFlow}
              description="Cash from asset purchases/sales"
            />
            <CashFlowSource
              label="Financing Activities"
              amount={financingCashFlow}
              description="Cash from loans, equity, or distributions"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section E: Optional Evidence - Traceability (Excel Elimination Doctrine) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evidence & Details</CardTitle>
          <p className="text-sm text-muted-foreground">
            Trace numbers to source transactions (≤3 clicks)
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Link href="/reports/pnl?tab=cashflow" className="block">
              <Button variant="outline" className="w-full justify-between group hover:bg-accent">
                <span>View Cash Flow Statement</span>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </Link>
            <Link href="/ledger?accountCode=1000" className="block">
              <Button variant="outline" className="w-full justify-between group hover:bg-accent">
                <span>View Cash Account Ledger</span>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </Link>
            <Link href="/bank" className="block">
              <Button variant="outline" className="w-full justify-between group hover:bg-accent">
                <span>View Bank Accounts</span>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CashMetric({
  label,
  amount,
  trend,
}: {
  label: string;
  amount: number;
  trend: "stable" | "improving" | "worsening";
}) {
  const trendIcon = {
    stable: Minus,
    improving: ArrowUp,
    worsening: ArrowDown,
  }[trend];

  const trendColor = {
    stable: "text-blue-600",
    improving: "text-green-600",
    worsening: "text-red-600",
  }[trend];

  const Icon = trendIcon;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">{label}</p>
        <Icon className={`h-4 w-4 ${trendColor}`} />
      </div>
      <p className="text-2xl font-bold">{formatCurrency(amount)}</p>
    </div>
  );
}

function ImpactItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-3 rounded-md border bg-card">
      <h4 className="font-medium mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function CashFlowSource({
  label,
  amount,
  description,
}: {
  label: string;
  amount: number;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-md border bg-card">
      <div className="flex-1">
        <p className="font-medium text-sm mb-1">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <p className={`text-2xl font-bold ml-4 ${amount >= 0 ? "text-green-600" : "text-red-600"}`}>
        {formatCurrency(amount)}
      </p>
    </div>
  );
}


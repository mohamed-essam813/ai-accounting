/**
 * Insight Detail View - Payables
 * UX Composition Section 3: SCREEN 2 - Insight Detail View
 * Engineering Guide Section 2.2: Insight Screens (Understanding Zone)
 * 
 * Question It Answers: "Explain what's happening with payables and why it matters."
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAPAgeingSummary } from "@/lib/data/ageing";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";

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
            data: { total_debit: number; total_credit: number } | null;
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

export default async function PayablesInsightPage() {
  const [ageingSummary, cashBalance] = await Promise.all([
    getAPAgeingSummary(),
    getCashBalance(),
  ]);

  // Calculate totals
  const totalOutstanding = ageingSummary.reduce((sum, item) => sum + item.total_outstanding, 0);
  const totalCurrent = ageingSummary.reduce((sum, item) => sum + item.total_current, 0);
  const total31_60 = ageingSummary.reduce((sum, item) => sum + item.total_31_60, 0);
  const total61_90 = ageingSummary.reduce((sum, item) => sum + item.total_61_90, 0);
  const total90Plus = ageingSummary.reduce((sum, item) => sum + item.total_90_plus, 0);

  const overdueTotal = total31_60 + total61_90 + total90Plus;
  const nearTermPayables = totalCurrent + total31_60; // Due in next 30 days
  const cashComfortThreshold = cashBalance * 0.3; // 30% of cash as comfort buffer

  // Generate insight summary (UX Composition Section 3, Screen 2, Section A)
  let insightSummary = "";
  if (totalOutstanding === 0) {
    insightSummary = "No outstanding payables. All supplier bills have been paid.";
  } else if (nearTermPayables <= cashComfortThreshold && overdueTotal === 0) {
    insightSummary = `You owe ${formatCurrency(totalOutstanding)} to suppliers, but only ${formatCurrency(
      nearTermPayables,
    )} is due in the next 30 days. You have short-term flexibility without damaging supplier relationships.`;
  } else if (nearTermPayables > cashComfortThreshold && overdueTotal === 0) {
    insightSummary = `You owe ${formatCurrency(totalOutstanding)} to suppliers, with ${formatCurrency(
      nearTermPayables,
    )} due in the next 30 days. This may create cash pressure if not managed carefully.`;
  } else if (overdueTotal > 0) {
    insightSummary = `You have ${formatCurrency(overdueTotal)} in overdue payables. This may impact supplier relationships if not addressed.`;
  } else {
    insightSummary = `You owe ${formatCurrency(totalOutstanding)} to suppliers. Manage payment timing to maintain cash flexibility.`;
  }

  // Top suppliers contributing to payables (UX Composition Section 3, Screen 2, Section D)
  const topSuppliers = ageingSummary
    .sort((a, b) => b.total_outstanding - a.total_outstanding)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Section A: Insight Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payables Insight</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed text-foreground">{insightSummary}</p>
        </CardContent>
      </Card>

      {/* Section B: Ageing Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ageing Breakdown</CardTitle>
          <p className="text-sm text-muted-foreground">
            Payables grouped by days until due / overdue
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AgeingBucket
              label="Current (0-30 days)"
              amount={totalCurrent}
              percentage={totalOutstanding > 0 ? (totalCurrent / totalOutstanding) * 100 : 0}
              trend="stable"
            />
            <AgeingBucket
              label="31-60 days"
              amount={total31_60}
              percentage={totalOutstanding > 0 ? (total31_60 / totalOutstanding) * 100 : 0}
              trend={total31_60 > 0 ? "worsening" : "stable"}
            />
            <AgeingBucket
              label="61-90 days"
              amount={total61_90}
              percentage={totalOutstanding > 0 ? (total61_90 / totalOutstanding) * 100 : 0}
              trend={total61_90 > 0 ? "worsening" : "stable"}
            />
            <AgeingBucket
              label="90+ days"
              amount={total90Plus}
              percentage={totalOutstanding > 0 ? (total90Plus / totalOutstanding) * 100 : 0}
              trend={total90Plus > 0 ? "worsening" : "stable"}
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
            title="Cash Pressure"
            description={
              nearTermPayables > cashBalance * 0.8
                ? `${formatCurrency(nearTermPayables)} is due soon, which may create cash pressure. Plan payment schedule carefully.`
                : nearTermPayables > cashComfortThreshold
                  ? `${formatCurrency(nearTermPayables)} is due in the next 30 days. Manage timing to maintain cash flexibility.`
                  : "Near-term payables are manageable relative to cash balance."
            }
          />
          <ImpactItem
            title="Timing Flexibility"
            description={
              nearTermPayables < cashBalance * 0.5
                ? "You have flexibility in payment timing without impacting cash flow significantly."
                : "Payment timing requires careful planning to maintain cash balance."
            }
          />
          <ImpactItem
            title="Supplier Relationship Risk"
            description={
              overdueTotal > 0
                ? `${formatCurrency(overdueTotal)} in overdue payables may impact supplier relationships and credit terms.`
                : "All payables are current. Supplier relationships are maintained."
            }
          />
        </CardContent>
      </Card>

      {/* Section D: Underlying Drivers */}
      {topSuppliers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Suppliers Contributing</CardTitle>
            <p className="text-sm text-muted-foreground">
              Suppliers with the highest outstanding payables
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topSuppliers.map((supplier, index) => (
                <div
                  key={supplier.vendor_name}
                  className="flex items-center justify-between p-3 rounded-md border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{supplier.vendor_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(supplier.total_outstanding)} outstanding
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {totalOutstanding > 0
                        ? `${Math.round((supplier.total_outstanding / totalOutstanding) * 100)}%`
                        : "0%"}
                    </p>
                    <p className="text-xs text-muted-foreground">of total</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section E: Optional Evidence */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evidence & Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Link href="/contacts" className="block">
              <Button variant="outline" className="w-full justify-between group hover:bg-accent">
                <span>View Supplier Sub-Ledgers</span>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </Link>
            <Link href="/reports/pnl?tab=ap" className="block">
              <Button variant="outline" className="w-full justify-between group hover:bg-accent">
                <span>View AP Ageing Report</span>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgeingBucket({
  label,
  amount,
  percentage,
  trend,
}: {
  label: string;
  amount: number;
  percentage: number;
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
      <p className="text-xs text-muted-foreground mt-1">
        {percentage.toFixed(1)}% of total
      </p>
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


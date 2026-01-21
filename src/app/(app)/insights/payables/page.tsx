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

  // Calculate overdue amounts by supplier (for specific recommendations)
  const suppliersWithOverdue = ageingSummary
    .map((supplier) => ({
      ...supplier,
      totalOverdue: supplier.total_31_60 + supplier.total_61_90 + supplier.total_90_plus,
    }))
    .filter((s) => s.totalOverdue > 0)
    .sort((a, b) => b.totalOverdue - a.totalOverdue);

  // Top suppliers with overdue amounts
  const topOverdueSuppliers = suppliersWithOverdue.slice(0, 5);
  const top2OverdueTotal = topOverdueSuppliers.slice(0, 2).reduce((sum, s) => sum + s.totalOverdue, 0);
  const top2Percentage = overdueTotal > 0 ? (top2OverdueTotal / overdueTotal) * 100 : 0;

  // Generate specific actionable insight summary
  let insightSummary = "";
  if (totalOutstanding === 0) {
    insightSummary = "No outstanding payables. All supplier bills have been paid.";
  } else if (overdueTotal > 0) {
    const topSupplier = topOverdueSuppliers[0];
    if (topSupplier && top2Percentage >= 70) {
      // High concentration - specific recommendation
      insightSummary = `${formatCurrency(overdueTotal)} overdue >30 days. ${topOverdueSuppliers.slice(0, 2).length} supplier${topOverdueSuppliers.slice(0, 2).length > 1 ? "s" : ""} account for ${Math.round(top2Percentage)}%. Prioritize payment to ${topSupplier.vendor_name} first (${formatCurrency(topSupplier.totalOverdue)} overdue) to maintain relationship. Risk: Supplier may restrict credit terms if not addressed within 1-2 weeks.`;
    } else if (topSupplier) {
      // Moderate concentration
      insightSummary = `${formatCurrency(overdueTotal)} overdue >30 days. ${topOverdueSuppliers.length} supplier${topOverdueSuppliers.length > 1 ? "s" : ""} have overdue amounts. Prioritize ${topSupplier.vendor_name} first (${formatCurrency(topSupplier.totalOverdue)} overdue). This may impact supplier relationships if not addressed within 2-3 weeks.`;
    } else {
      insightSummary = `${formatCurrency(overdueTotal)} overdue >30 days. This may impact supplier relationships if not addressed.`;
    }
  } else if (nearTermPayables <= cashComfortThreshold && overdueTotal === 0) {
    insightSummary = `You owe ${formatCurrency(totalOutstanding)} to suppliers, but only ${formatCurrency(
      nearTermPayables,
    )} is due in the next 30 days. You have short-term flexibility without damaging supplier relationships.`;
  } else if (nearTermPayables > cashComfortThreshold && overdueTotal === 0) {
    insightSummary = `You owe ${formatCurrency(totalOutstanding)} to suppliers, with ${formatCurrency(
      nearTermPayables,
    )} due in the next 30 days. This may create cash pressure if not managed carefully.`;
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

      {/* Section C: Actionable Recommendations (NEW - Specific Recommendations) */}
      {overdueTotal > 0 && topOverdueSuppliers.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="text-lg text-orange-900">Actionable Recommendations</CardTitle>
            <p className="text-sm text-orange-700">
              Specific actions to manage supplier relationships
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Priority 1: Top Overdue Supplier */}
            {topOverdueSuppliers[0] && (
              <div className="p-4 rounded-lg border border-orange-200 bg-white">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm">
                    1
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm mb-1">
                      Prioritize Payment: {topOverdueSuppliers[0].vendor_name}
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      {formatCurrency(topOverdueSuppliers[0].totalOverdue)} overdue ({Math.round((topOverdueSuppliers[0].totalOverdue / overdueTotal) * 100)}% of total overdue)
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>• 31-60 days: {formatCurrency(topOverdueSuppliers[0].total_31_60)}</p>
                      <p>• 61-90 days: {formatCurrency(topOverdueSuppliers[0].total_61_90)}</p>
                      <p>• 90+ days: {formatCurrency(topOverdueSuppliers[0].total_90_plus)}</p>
                      <p className="mt-2 font-medium text-orange-700">
                        Risk: Supplier may restrict credit terms if not paid within 1-2 weeks
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Priority 2: Second Overdue Supplier */}
            {topOverdueSuppliers[1] && (
              <div className="p-4 rounded-lg border border-orange-200 bg-white">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-orange-400 text-white flex items-center justify-center font-bold text-sm">
                    2
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm mb-1">
                      Prioritize Payment: {topOverdueSuppliers[1].vendor_name}
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      {formatCurrency(topOverdueSuppliers[1].totalOverdue)} overdue ({Math.round((topOverdueSuppliers[1].totalOverdue / overdueTotal) * 100)}% of total overdue)
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>• 31-60 days: {formatCurrency(topOverdueSuppliers[1].total_31_60)}</p>
                      <p>• 61-90 days: {formatCurrency(topOverdueSuppliers[1].total_61_90)}</p>
                      <p>• 90+ days: {formatCurrency(topOverdueSuppliers[1].total_90_plus)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Summary Stats */}
            <div className="pt-3 border-t border-orange-200">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Overdue</p>
                  <p className="font-semibold text-lg">{formatCurrency(overdueTotal)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Suppliers with Overdue</p>
                  <p className="font-semibold text-lg">{suppliersWithOverdue.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Relationship Risk</p>
                  <p className="font-semibold text-lg text-orange-700">
                    {overdueTotal > totalOutstanding * 0.2 ? "High" : "Moderate"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Action Timeline</p>
                  <p className="font-semibold text-lg">1-2 weeks</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
            <Link href="/ledger?accountCode=2000" className="block">
              <Button variant="outline" className="w-full justify-between group hover:bg-accent">
                <span>View Payables Ledger</span>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </Link>
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


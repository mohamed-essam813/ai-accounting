/**
 * Insight Detail View - Receivables
 * UX Composition Section 3: SCREEN 2 - Insight Detail View
 * Engineering Guide Section 2.2: Insight Screens (Understanding Zone)
 * 
 * Question It Answers: "Explain what's happening with receivables and why it matters."
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getARAgeingSummary } from "@/lib/data/ageing";
import { formatCurrency } from "@/lib/format";
import { ArrowUp, ArrowDown, Minus, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const revalidate = 60;

export default async function ReceivablesInsightPage() {
  const ageingSummary = await getARAgeingSummary();

  // Calculate totals
  const totalOutstanding = ageingSummary.reduce((sum, item) => sum + item.total_outstanding, 0);
  const totalCurrent = ageingSummary.reduce((sum, item) => sum + item.total_current, 0);
  const total31_60 = ageingSummary.reduce((sum, item) => sum + item.total_31_60, 0);
  const total61_90 = ageingSummary.reduce((sum, item) => sum + item.total_61_90, 0);
  const total90Plus = ageingSummary.reduce((sum, item) => sum + item.total_90_plus, 0);

  const overdueTotal = total31_60 + total61_90 + total90Plus;
  const overduePercentage = totalOutstanding > 0 ? (overdueTotal / totalOutstanding) * 100 : 0;

  // Calculate overdue amounts by customer (for specific recommendations)
  const customersWithOverdue = ageingSummary
    .map((customer) => ({
      ...customer,
      totalOverdue: customer.total_31_60 + customer.total_61_90 + customer.total_90_plus,
    }))
    .filter((c) => c.totalOverdue > 0)
    .sort((a, b) => b.totalOverdue - a.totalOverdue);

  // Top customers with overdue amounts
  const topOverdueCustomers = customersWithOverdue.slice(0, 5);
  const top2OverdueTotal = topOverdueCustomers.slice(0, 2).reduce((sum, c) => sum + c.totalOverdue, 0);
  const top2Percentage = overdueTotal > 0 ? (top2OverdueTotal / overdueTotal) * 100 : 0;

  // Generate specific actionable insight summary
  let insightSummary = "";
  if (overdueTotal === 0 && totalOutstanding > 0) {
    insightSummary = "All receivables are current. Customer payments are on time, maintaining healthy cash flow.";
  } else if (overdueTotal > 0) {
    const topCustomer = topOverdueCustomers[0];
    if (topCustomer && top2Percentage >= 70) {
      // High concentration - specific recommendation
      insightSummary = `${formatCurrency(overdueTotal)} overdue >30 days. ${topOverdueCustomers.slice(0, 2).length} customer${topOverdueCustomers.slice(0, 2).length > 1 ? "s" : ""} account for ${Math.round(top2Percentage)}%. Follow up ${topCustomer.customer_name} first (${formatCurrency(topCustomer.totalOverdue)} overdue). Expected cash recovery: 2-3 weeks with active follow-up.`;
    } else if (topCustomer) {
      // Moderate concentration
      insightSummary = `${formatCurrency(overdueTotal)} overdue >30 days. ${topOverdueCustomers.length} customer${topOverdueCustomers.length > 1 ? "s" : ""} have overdue amounts. Focus on ${topCustomer.customer_name} first (${formatCurrency(topCustomer.totalOverdue)} overdue). This is slowing cash inflow by ~${formatCurrency(overdueTotal)}. Expected cash recovery: 2-4 weeks.`;
    } else {
      insightSummary = `${formatCurrency(overdueTotal)} overdue >30 days. This is slowing cash inflow. Review overdue invoices and follow up with customers.`;
    }
  } else {
    insightSummary = "All receivables are current, maintaining healthy cash flow.";
  }

  // Top customers contributing to receivables (UX Composition Section 3, Screen 2, Section D)
  const topCustomers = ageingSummary
    .sort((a, b) => b.total_outstanding - a.total_outstanding)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Section A: Insight Summary (UX Composition Section 3, Screen 2, Section A) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Receivables Insight</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed text-foreground">{insightSummary}</p>
        </CardContent>
      </Card>

      {/* Section B: Ageing Breakdown (UX Composition Section 3, Screen 2, Section B) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ageing Breakdown</CardTitle>
          <p className="text-sm text-muted-foreground">
            Receivables grouped by days overdue
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
      {overdueTotal > 0 && topOverdueCustomers.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="text-lg text-orange-900">Actionable Recommendations</CardTitle>
            <p className="text-sm text-orange-700">
              Specific actions to improve cash collection
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Priority 1: Top Overdue Customer */}
            {topOverdueCustomers[0] && (
              <div className="p-4 rounded-lg border border-orange-200 bg-white">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm">
                    1
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm mb-1">
                      Follow up: {topOverdueCustomers[0].customer_name}
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      {formatCurrency(topOverdueCustomers[0].totalOverdue)} overdue ({Math.round((topOverdueCustomers[0].totalOverdue / overdueTotal) * 100)}% of total overdue)
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>• 31-60 days: {formatCurrency(topOverdueCustomers[0].total_31_60)}</p>
                      <p>• 61-90 days: {formatCurrency(topOverdueCustomers[0].total_61_90)}</p>
                      <p>• 90+ days: {formatCurrency(topOverdueCustomers[0].total_90_plus)}</p>
                      <p className="mt-2 font-medium text-orange-700">
                        Expected cash recovery: 2-3 weeks with active follow-up
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Priority 2: Second Overdue Customer */}
            {topOverdueCustomers[1] && (
              <div className="p-4 rounded-lg border border-orange-200 bg-white">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-orange-400 text-white flex items-center justify-center font-bold text-sm">
                    2
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm mb-1">
                      Follow up: {topOverdueCustomers[1].customer_name}
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      {formatCurrency(topOverdueCustomers[1].totalOverdue)} overdue ({Math.round((topOverdueCustomers[1].totalOverdue / overdueTotal) * 100)}% of total overdue)
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>• 31-60 days: {formatCurrency(topOverdueCustomers[1].total_31_60)}</p>
                      <p>• 61-90 days: {formatCurrency(topOverdueCustomers[1].total_61_90)}</p>
                      <p>• 90+ days: {formatCurrency(topOverdueCustomers[1].total_90_plus)}</p>
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
                  <p className="text-muted-foreground">Customers with Overdue</p>
                  <p className="font-semibold text-lg">{customersWithOverdue.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cash Impact</p>
                  <p className="font-semibold text-lg text-orange-700">
                    -{formatCurrency(overdueTotal)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Expected Recovery</p>
                  <p className="font-semibold text-lg">2-4 weeks</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section C: Business Impact (UX Composition Section 3, Screen 2, Section C) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Business Impact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ImpactItem
            title="Cash Impact"
            description={
              overdueTotal > 0
                ? `${formatCurrency(overdueTotal)} is delayed, reducing available cash. If this trend continues, cash availability may tighten within 3-4 weeks.`
                : "All receivables are current, maintaining healthy cash flow."
            }
          />
          <ImpactItem
            title="Risk Exposure"
            description={
              overduePercentage > 30
                ? "High concentration of overdue receivables increases collection risk and may require follow-up actions."
                : overduePercentage > 10
                  ? "Moderate risk. Monitor closely and consider following up on overdue invoices."
                  : "Low risk. Receivables are well-managed."
            }
          />
          <ImpactItem
            title="Operational Consequence"
            description={
              overdueTotal > totalOutstanding * 0.3
                ? "Significant portion of working capital is tied up in overdue receivables, limiting operational flexibility."
                : "Receivables are manageable and not significantly impacting operations."
            }
          />
        </CardContent>
      </Card>

      {/* Section D: Underlying Drivers (UX Composition Section 3, Screen 2, Section D) */}
      {topCustomers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Customers Contributing</CardTitle>
            <p className="text-sm text-muted-foreground">
              Customers with the highest outstanding receivables
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topCustomers.map((customer, index) => (
                <div
                  key={customer.customer_name}
                  className="flex items-center justify-between p-3 rounded-md border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{customer.customer_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(customer.total_outstanding)} outstanding
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {totalOutstanding > 0
                        ? `${Math.round((customer.total_outstanding / totalOutstanding) * 100)}%`
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

      {/* Section E: Optional Evidence (UX Composition Section 3, Screen 2, Section E) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evidence & Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Link href="/ledger?accountCode=1100" className="block">
              <Button variant="outline" className="w-full justify-between group hover:bg-accent">
                <span>View Receivables Ledger</span>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </Link>
            <Link href="/contacts" className="block">
              <Button variant="outline" className="w-full justify-between group hover:bg-accent">
                <span>View Customer Sub-Ledgers</span>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </Link>
            <Link href="/reports/pnl?tab=ar" className="block">
              <Button variant="outline" className="w-full justify-between group hover:bg-accent">
                <span>View AR Ageing Report</span>
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


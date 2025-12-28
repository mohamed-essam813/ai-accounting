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

  // Generate insight summary (UX Composition Section 3, Screen 2, Section A)
  let insightSummary = "";
  if (overdueTotal === 0 && totalOutstanding > 0) {
    insightSummary = "All receivables are current. Customer payments are on time, maintaining healthy cash flow.";
  } else if (overduePercentage < 10) {
    insightSummary = "Most receivables are current. A small portion is overdue, with minimal impact on cash availability.";
  } else if (overduePercentage < 30) {
    insightSummary = "Customer payments are slowing compared to normal. Some receivables are overdue, increasing pressure on cash.";
  } else {
    insightSummary = "A significant portion of receivables are overdue. This delay is significantly slowing cash availability and increasing collection risk.";
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


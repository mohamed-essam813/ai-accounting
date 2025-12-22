/**
 * PRD-Compliant Dashboard
 * Based on PRD Section 5: Dashboard Philosophy
 * 
 * This is a Financial Radar, not a summary.
 * Shows change over totals, states over metrics, narratives over charts.
 * Calm by default - silence is a feature.
 */

import { FinancialPulseCard } from "@/components/dashboard/financial-pulse";
import { AttentionSignals } from "@/components/dashboard/attention-signals";
import { RecentFinancialEvents } from "@/components/dashboard/recent-events";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote, Link2 } from "lucide-react";
import Link from "next/link";
import {
  getFinancialPulse,
  getAttentionSignals,
  getRecentFinancialEvents,
} from "@/lib/data/dashboard-prd";

export const revalidate = 60;

export default async function DashboardPage() {
  const [pulse, signals, events] = await Promise.all([
    getFinancialPulse(),
    getAttentionSignals(),
    getRecentFinancialEvents(5),
  ]);

  return (
    <div className="space-y-6">
      {/* Section 1: Financial Pulse (Top Narrative) */}
      <FinancialPulseCard pulse={pulse} />

      {/* Section 2: Attention Signals (Core) */}
      <div>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Attention Signals</h2>
          <p className="text-sm text-muted-foreground">
            Key financial indicators that need your attention
          </p>
        </div>
        <AttentionSignals signals={signals} />
      </div>

      {/* Section 3: Recent Financial Events (Optional) */}
      {events.length > 0 && <RecentFinancialEvents events={events} />}

      {/* Section 4: Banks (Utility) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Banknote className="h-4 w-4" />
            Bank Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Connected banks</span>
            <Link
              href="/bank"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <span>Reconcile</span>
              <Link2 className="h-3 w-3" />
            </Link>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Manage bank connections and reconciliation in the Bank module.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

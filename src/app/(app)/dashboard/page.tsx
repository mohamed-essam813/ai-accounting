import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { getDashboardMetrics } from "@/lib/data/dashboard";
import { getRecentDrafts } from "@/lib/data/drafts";
import { getRecentAuditEvents } from "@/lib/data/audit";
import { formatCurrency } from "@/lib/format";

export const revalidate = 60;

export default async function DashboardPage() {
  const [metrics, drafts, audit] = await Promise.all([
    getDashboardMetrics(),
    getRecentDrafts(5),
    getRecentAuditEvents(5),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-semibold">Operational Overview</h2>
        <p className="text-sm text-muted-foreground">
          Track AI prompt throughput, approvals, and ledger health.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Drafts Generated" value={metrics.drafts} subtitle="Drafts in the last 30 days." />
          <KpiCard
            title="Approvals Pending"
            value={metrics.approvalsPending}
            subtitle="Items requiring human review."
          />
          <KpiCard
            title="Posted Entries"
            value={metrics.postedEntries}
            subtitle="Balanced entries posted to the ledger."
          />
          <KpiCard
            title="Cash Balance"
            value={formatCurrency(metrics.cashBalance)}
            subtitle="Derived from cash accounts."
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AI Draft Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No drafts have been generated yet. Head to the prompt workspace to get started.
              </p>
            ) : (
              drafts.map((draft) => (
                <div key={draft.id} className="rounded-md border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold capitalize">{draft.intent.replace("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        Confidence: {draft.confidence ? `${(draft.confidence * 100).toFixed(0)}%` : "N/A"}
                      </p>
                    </div>
                    <span className="text-xs uppercase text-muted-foreground">{draft.status}</span>
                  </div>
                  <Separator className="my-3" />
                  <div className="text-sm text-muted-foreground">
                    {draft.entities.description ?? "No description captured."}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit Highlights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Once users start collaborating, audit entries will appear here.
              </p>
            ) : (
              audit.map((entry) => (
                <div key={entry.id} className="rounded-md border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{entry.action}</p>
                    <span className="text-xs text-muted-foreground">{entry.created_at}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {entry.changesSummary ?? "No additional metadata."}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <Tabs defaultValue="pnl" className="rounded-lg border bg-card p-6">
        <TabsList>
          <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
        </TabsList>
        <TabsContent value="pnl" className="space-y-4 pt-4">
          <FinancialRow label="Revenue" value={metrics.revenue} />
          <FinancialRow label="Expenses" value={metrics.expenses} />
          <Separator />
          <FinancialRow label="Net Income" value={metrics.netIncome} highlight />
        </TabsContent>
        <TabsContent value="balance" className="space-y-4 pt-4">
          <FinancialRow label="Assets" value={metrics.cashBalance + metrics.revenue - metrics.expenses} />
          <FinancialRow label="Liabilities" value={metrics.expenses * 0.3} />
          <FinancialRow label="Equity" value={metrics.netIncome} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ title, value, subtitle }: { title: string; value: string | number; subtitle: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function FinancialRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={highlight ? "text-lg font-semibold text-primary" : "text-sm font-medium"}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}


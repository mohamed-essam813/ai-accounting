import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { getDashboardMetrics } from "@/lib/data/dashboard";
import { getRecentDrafts } from "@/lib/data/drafts";
import { getRecentAuditEvents, type AuditEvent } from "@/lib/data/audit";
import { getProfitAndLoss, getBalanceSheet, getCashFlow } from "@/lib/data/reports";
import { formatCurrency, formatDate } from "@/lib/format";
import { TrendingUp, TrendingDown, DollarSign, FileText, Banknote, Receipt } from "lucide-react";

export const revalidate = 60;

export default async function DashboardPage() {
  const [metrics, drafts, audit, pnl, balanceSheet, cashFlow] = await Promise.all([
    getDashboardMetrics(),
    getRecentDrafts(5),
    getRecentAuditEvents(5),
    getProfitAndLoss(),
    getBalanceSheet(),
    getCashFlow(),
  ]);

  const revenue = Number(pnl?.total_revenue ?? 0);
  const expenses = Number(pnl?.total_expense ?? 0);
  const netIncome = Number(pnl?.net_income ?? 0);
  const assets = Number(balanceSheet?.assets ?? 0);
  const liabilities = Number(balanceSheet?.liabilities ?? 0);
  const equity = Number(balanceSheet?.equity ?? 0);
  const cashFlowAmount = Number(cashFlow?.net_cash_flow ?? 0);

  // Count invoices and bills from drafts
  type DraftWithIntent = { intent: string };
  const invoices = drafts.filter((d: DraftWithIntent) => d.intent === "create_invoice").length;
  const bills = drafts.filter((d: DraftWithIntent) => d.intent === "create_bill").length;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-semibold">Financial Overview</h2>
        <p className="text-sm text-muted-foreground">
          Real-time financial metrics and key performance indicators.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Revenue"
            value={formatCurrency(revenue)}
            subtitle="All revenue accounts"
            icon={TrendingUp}
            trend={revenue > 0 ? "positive" : "neutral"}
          />
          <KpiCard
            title="Total Expenses"
            value={formatCurrency(expenses)}
            subtitle="All expense accounts"
            icon={TrendingDown}
            trend={expenses > 0 ? "negative" : "neutral"}
          />
          <KpiCard
            title="Net Income"
            value={formatCurrency(netIncome)}
            subtitle={netIncome >= 0 ? "Profit" : "Loss"}
            icon={DollarSign}
            trend={netIncome >= 0 ? "positive" : "negative"}
          />
          <KpiCard
            title="Cash Balance"
            value={formatCurrency(metrics.cashBalance)}
            subtitle="Cash account balance"
            icon={Banknote}
            trend={metrics.cashBalance >= 0 ? "positive" : "negative"}
          />
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-4">Balance Sheet Summary</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Assets</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatCurrency(assets)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Liabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatCurrency(liabilities)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Equity</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatCurrency(equity)}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Invoices</span>
              <span className="font-medium">{invoices}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Bills</span>
              <span className="font-medium">{bills}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Cash Flow</span>
              <span className={`font-medium ${cashFlowAmount >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(cashFlowAmount)}
              </span>
            </div>
            {drafts.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Latest Drafts</p>
                  {drafts.slice(0, 3).map((draft: { id: string; intent: string; status: string; entities: { amount?: number; currency?: string } }) => (
                    <div key={draft.id} className="rounded-md border bg-muted p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="capitalize">{draft.intent.replace("_", " ")}</span>
                        <span className="text-xs text-muted-foreground">{draft.status}</span>
                      </div>
                      {draft.entities.amount && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatCurrency(draft.entities.amount, draft.entities.currency ?? "AED")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Operational Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Drafts Generated</span>
              <span className="font-medium">{metrics.drafts}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Approvals Pending</span>
              <span className="font-medium">{metrics.approvalsPending}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Posted Entries</span>
              <span className="font-medium">{metrics.postedEntries}</span>
            </div>
            {audit.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Recent Activity</p>
                  {audit.slice(0, 3).map((entry: AuditEvent) => (
                    <div key={entry.id} className="rounded-md border bg-muted p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="capitalize">{entry.action.replace(/\./g, " ")}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(entry.created_at)}
                        </span>
                      </div>
                      {entry.actor_email && (
                        <p className="mt-1 text-xs text-muted-foreground">by {entry.actor_email}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
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
          <FinancialRow label="Total Revenue" value={revenue} />
          <FinancialRow label="Total Expenses" value={expenses} />
          <Separator />
          <FinancialRow label="Net Income" value={netIncome} highlight />
        </TabsContent>
        <TabsContent value="balance" className="space-y-4 pt-4">
          <FinancialRow label="Assets" value={assets} />
          <FinancialRow label="Liabilities" value={liabilities} />
          <Separator />
          <FinancialRow label="Equity" value={equity} highlight />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "positive" | "negative" | "neutral";
}) {
  const trendColor =
    trend === "positive"
      ? "text-green-600"
      : trend === "negative"
        ? "text-red-600"
        : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <Icon className={`h-4 w-4 ${trendColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-semibold ${trendColor}`}>{value}</p>
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

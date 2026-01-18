/**
 * PRD-Compliant Dashboard
 * Based on PRD Section 5: Dashboard Philosophy
 * 
 * This is a Financial Radar, not a summary.
 * Shows change over totals, states over metrics, narratives over charts.
 * Calm by default - silence is a feature.
 */

import { FinancialPulseCard } from "@/components/dashboard/financial-pulse";
import { RecentFinancialEvents } from "@/components/dashboard/recent-events";
import { AttentionSignalCard } from "@/components/dashboard/attention-signals";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { RevenueExpenseChart } from "@/components/dashboard/revenue-expense-chart";
import { ARAPAgeingChart } from "@/components/dashboard/ar-ap-ageing-chart";
import { ProfitabilityChart } from "@/components/dashboard/profitability-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote, Link2, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import {
  getFinancialPulse,
  getAttentionSignals,
  getRecentFinancialEvents,
  type AttentionSignal,
  type RecentFinancialEvent,
  type FinancialPulse,
} from "@/lib/data/dashboard-prd";
import {
  getPeriodFinancialData,
  type PeriodFinancialData,
} from "@/lib/data/period-comparison";
import {
  getCurrentMonth,
  getPreviousMonth,
  getCurrentQuarter,
  getPreviousQuarter,
  getCurrentYear,
  getPreviousYear,
  getPreviousPeriodRange,
  getSamePeriodLastYear,
  calculateComparison,
  type DateRange,
} from "@/lib/utils/period-comparison";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { AIRecommendations } from "@/components/dashboard/ai-recommendations";

export const revalidate = 60;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; startDate?: string; endDate?: string; compare?: "previous" | "lastYear"; currency?: string }>;
}) {
  const params = await searchParams;
  const period = params.period || "month";
  const startDate = params.startDate;
  const endDate = params.endDate;
  const comparisonType = params.compare || "previous";
  const currency = params.currency;

  // Handle errors gracefully - if data fetching fails, show empty state
  let pulse: FinancialPulse;
  let signals: AttentionSignal[];
  let events: RecentFinancialEvent[];
  let currentPeriodData: PeriodFinancialData;
  let previousPeriodData: PeriodFinancialData;
  
  try {
    // Get current and comparison period data based on filter
    let currentPeriod: DateRange;
    let comparisonPeriod: DateRange;
    
    if (startDate && endDate) {
      // Custom date range
      currentPeriod = {
        startDate,
        endDate,
      };
      // Use comparison type to determine comparison period
      if (comparisonType === "lastYear") {
        comparisonPeriod = getSamePeriodLastYear(startDate, endDate);
      } else {
        comparisonPeriod = getPreviousPeriodRange(startDate, endDate);
      }
    } else {
      // Preset periods
      switch (period) {
        case "quarter":
          currentPeriod = getCurrentQuarter();
          if (comparisonType === "lastYear") {
            comparisonPeriod = getSamePeriodLastYear(currentPeriod.startDate, currentPeriod.endDate);
          } else {
            comparisonPeriod = getPreviousQuarter();
          }
          break;
        case "year":
          currentPeriod = getCurrentYear();
          if (comparisonType === "lastYear") {
            comparisonPeriod = getSamePeriodLastYear(currentPeriod.startDate, currentPeriod.endDate);
          } else {
            comparisonPeriod = getPreviousYear();
          }
          break;
        default: // "month"
          currentPeriod = getCurrentMonth();
          if (comparisonType === "lastYear") {
            comparisonPeriod = getSamePeriodLastYear(currentPeriod.startDate, currentPeriod.endDate);
          } else {
            comparisonPeriod = getPreviousMonth();
          }
      }
    }
    
    [pulse, signals, events, currentPeriodData, previousPeriodData] = await Promise.all([
      getFinancialPulse(),
      getAttentionSignals(),
      getRecentFinancialEvents(5),
      getPeriodFinancialData(currentPeriod),
      getPeriodFinancialData(comparisonPeriod),
    ]);
  } catch (error) {
    console.error("Dashboard data fetch failed:", error);
    // Return default values on error
    pulse = {
      text: "Unable to load financial data. Please check your connection.",
      severity: "attention",
    };
    signals = [];
    events = [];
    currentPeriodData = {
      revenue: 0,
      expenses: 0,
      netIncome: 0,
      cashBalance: 0,
      receivables: 0,
      payables: 0,
      cashFlow: 0,
    };
    previousPeriodData = {
      revenue: 0,
      expenses: 0,
      netIncome: 0,
      cashBalance: 0,
      receivables: 0,
      payables: 0,
      cashFlow: 0,
    };
  }

  // Calculate comparisons for charts
  const revenueComparison = calculateComparison(
    currentPeriodData.revenue,
    previousPeriodData.revenue,
  );
  const expenseComparison = calculateComparison(
    currentPeriodData.expenses,
    previousPeriodData.expenses,
  );
  const cashFlowComparison = calculateComparison(
    currentPeriodData.cashFlow,
    previousPeriodData.cashFlow,
  );
  const netIncomeComparison = calculateComparison(
    currentPeriodData.netIncome,
    previousPeriodData.netIncome,
  );
  const arComparison = calculateComparison(
    currentPeriodData.receivables,
    previousPeriodData.receivables,
  );
  const apComparison = calculateComparison(
    currentPeriodData.payables,
    previousPeriodData.payables,
  );

  return (
    <div className="space-y-6 pb-6">
      {/* Dashboard Filters */}
      <DashboardFilters
        initialPeriod={period}
        initialStartDate={startDate}
        initialEndDate={endDate}
        initialComparisonType={comparisonType}
        initialCurrency={currency}
      />

      {/* Section 1: Financial Pulse (Top Narrative) */}
      <FinancialPulseCard pulse={pulse} />

      {/* Section 2: Financial Trends (Charts) - Excel Elimination Doctrine */}
      <div className="space-y-6">
          {/* Revenue vs Expenses Chart with Related Metrics and Signals */}
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Revenue & Expenses</h3>
              <p className="text-sm text-muted-foreground">Revenue and expense trends with profitability analysis</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 items-stretch">
            <RevenueExpenseChart
              currentRevenue={currentPeriodData.revenue}
              previousRevenue={previousPeriodData.revenue}
              currentExpenses={currentPeriodData.expenses}
              previousExpenses={previousPeriodData.expenses}
              revenueComparison={revenueComparison}
              expenseComparison={expenseComparison}
            />
            <div className="flex flex-col gap-4 h-full">
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle className="text-base">Revenue & Expense Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Current Revenue</span>
                      <span className="text-sm font-semibold">{formatCurrency(currentPeriodData.revenue)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Current Expenses</span>
                      <span className="text-sm font-semibold">{formatCurrency(currentPeriodData.expenses)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Net Income</span>
                      <span className={`text-sm font-bold ${currentPeriodData.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(currentPeriodData.netIncome)}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      {revenueComparison.direction === "up" ? (
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      ) : revenueComparison.direction === "down" ? (
                        <TrendingDown className="h-3 w-3 text-red-600" />
                      ) : null}
                      <span className="text-muted-foreground">Revenue {revenueComparison.direction === "up" ? "↑" : revenueComparison.direction === "down" ? "↓" : "→"} {Math.abs(revenueComparison.percentageChange).toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {expenseComparison.direction === "down" ? (
                        <TrendingDown className="h-3 w-3 text-green-600" />
                      ) : expenseComparison.direction === "up" ? (
                        <TrendingUp className="h-3 w-3 text-red-600" />
                      ) : null}
                      <span className="text-muted-foreground">Expenses {expenseComparison.direction === "up" ? "↑" : expenseComparison.direction === "down" ? "↓" : "→"} {Math.abs(expenseComparison.percentageChange).toFixed(1)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {signals.find(s => s.id === "revenue_momentum") && (
                <div className="flex-1">
                  <AttentionSignalCard signal={signals.find(s => s.id === "revenue_momentum")!} />
                </div>
              )}
              {signals.find(s => s.id === "expense_control") && (
                <div className="flex-1">
                  <AttentionSignalCard signal={signals.find(s => s.id === "expense_control")!} />
                </div>
              )}
            </div>
          </div>
          </div>

          {/* Cash Flow Chart with Related Metrics and Signal */}
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Cash Flow</h3>
              <p className="text-sm text-muted-foreground">Cash generation and liquidity trends</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 items-stretch">
            <CashFlowChart
              currentCashFlow={currentPeriodData.cashFlow}
              previousCashFlow={previousPeriodData.cashFlow}
              comparison={cashFlowComparison}
            />
            <div className="flex flex-col gap-4 h-full">
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle className="text-base">Cash Flow Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Current Cash Flow</span>
                      <span className={`text-sm font-semibold ${currentPeriodData.cashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(currentPeriodData.cashFlow)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Previous Cash Flow</span>
                      <span className="text-sm font-medium">{formatCurrency(previousPeriodData.cashFlow)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Cash Balance</span>
                      <span className="text-sm font-bold">{formatCurrency(currentPeriodData.cashBalance)}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2 text-xs">
                      {cashFlowComparison.direction === "up" ? (
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      ) : cashFlowComparison.direction === "down" ? (
                        <TrendingDown className="h-3 w-3 text-red-600" />
                      ) : null}
                      <span className="text-muted-foreground">
                        {cashFlowComparison.direction === "up" ? "Improved" : cashFlowComparison.direction === "down" ? "Declined" : "Stable"} by {Math.abs(cashFlowComparison.percentageChange).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {signals.find(s => s.id === "cash_flow") && (
                <div className="flex-1">
                  <AttentionSignalCard signal={signals.find(s => s.id === "cash_flow")!} />
                </div>
              )}
            </div>
          </div>
          </div>

          {/* AR/AP Ageing Chart with Related Metrics and Signals */}
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Receivables & Payables</h3>
              <p className="text-sm text-muted-foreground">AR/AP ageing and working capital management</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 items-stretch">
            <ARAPAgeingChart
              currentAR={currentPeriodData.receivables}
              previousAR={previousPeriodData.receivables}
              currentAP={currentPeriodData.payables}
              previousAP={previousPeriodData.payables}
              arComparison={arComparison}
              apComparison={apComparison}
            />
            <div className="flex flex-col gap-4 h-full">
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle className="text-base">AR/AP Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Receivables (AR)</span>
                      <span className="text-sm font-semibold">{formatCurrency(currentPeriodData.receivables)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Payables (AP)</span>
                      <span className="text-sm font-semibold">{formatCurrency(currentPeriodData.payables)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Net Working Capital</span>
                      <span className={`text-sm font-bold ${(currentPeriodData.receivables - currentPeriodData.payables) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(currentPeriodData.receivables - currentPeriodData.payables)}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      {arComparison.direction === "down" ? (
                        <TrendingDown className="h-3 w-3 text-green-600" />
                      ) : arComparison.direction === "up" ? (
                        <TrendingUp className="h-3 w-3 text-red-600" />
                      ) : null}
                      <span className="text-muted-foreground">AR {arComparison.direction === "down" ? "↓" : arComparison.direction === "up" ? "↑" : "→"} {Math.abs(arComparison.percentageChange).toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {apComparison.direction === "down" ? (
                        <TrendingDown className="h-3 w-3 text-green-600" />
                      ) : apComparison.direction === "up" ? (
                        <TrendingUp className="h-3 w-3 text-red-600" />
                      ) : null}
                      <span className="text-muted-foreground">AP {apComparison.direction === "down" ? "↓" : apComparison.direction === "up" ? "↑" : "→"} {Math.abs(apComparison.percentageChange).toFixed(1)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {signals.find(s => s.id === "receivables_health") && (
                <div className="flex-1">
                  <AttentionSignalCard signal={signals.find(s => s.id === "receivables_health")!} />
                </div>
              )}
              {signals.find(s => s.id === "payables_pressure") && (
                <div className="flex-1">
                  <AttentionSignalCard signal={signals.find(s => s.id === "payables_pressure")!} />
                </div>
              )}
            </div>
          </div>
          </div>

          {/* Profitability Chart with Related Metrics and Signal */}
          <div className="space-y-3">
      <div>
              <h3 className="text-lg font-semibold">Profitability</h3>
              <p className="text-sm text-muted-foreground">Net income margin and profitability trends</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 items-stretch">
            <ProfitabilityChart
              currentRevenue={currentPeriodData.revenue}
              previousRevenue={previousPeriodData.revenue}
              currentNetIncome={currentPeriodData.netIncome}
              previousNetIncome={previousPeriodData.netIncome}
              netIncomeComparison={netIncomeComparison}
            />
            <div className="flex flex-col gap-4 h-full">
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle className="text-base">Profitability Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Net Income</span>
                      <span className={`text-sm font-semibold ${currentPeriodData.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(currentPeriodData.netIncome)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Revenue</span>
                      <span className="text-sm font-medium">{formatCurrency(currentPeriodData.revenue)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Profit Margin</span>
                      <span className={`text-sm font-bold ${currentPeriodData.revenue !== 0 && (currentPeriodData.netIncome / currentPeriodData.revenue) >= 0.1 ? "text-green-600" : "text-red-600"}`}>
                        {currentPeriodData.revenue !== 0 ? ((currentPeriodData.netIncome / currentPeriodData.revenue) * 100).toFixed(1) : "0.0"}%
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2 text-xs">
                      {netIncomeComparison.direction === "up" ? (
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      ) : netIncomeComparison.direction === "down" ? (
                        <TrendingDown className="h-3 w-3 text-red-600" />
                      ) : null}
                      <span className="text-muted-foreground">
                        Profitability {netIncomeComparison.direction === "up" ? "↑" : netIncomeComparison.direction === "down" ? "↓" : "→"} {Math.abs(netIncomeComparison.percentageChange).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {signals.find(s => s.id === "tax_exposure") && (
                <div className="flex-1">
                  <AttentionSignalCard signal={signals.find(s => s.id === "tax_exposure")!} />
                </div>
              )}
            </div>
          </div>
          </div>
      </div>

      {/* Section 3: AI Recommendations */}
      <AIRecommendations
        currentPeriodData={currentPeriodData}
        revenueComparison={revenueComparison}
        expenseComparison={expenseComparison}
        cashFlowComparison={cashFlowComparison}
        netIncomeComparison={netIncomeComparison}
        arComparison={arComparison}
        apComparison={apComparison}
      />

      {/* Section 4: Recent Financial Events (Optional) */}
      {events.length > 0 && (
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight">Recent Financial Events</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Meaningful financial activities and insights
            </p>
          </div>
          <RecentFinancialEvents events={events} />
        </div>
      )}

      {/* Section 5: Banks (Status Indicator - Clickable for Reconciliation) */}
      <Link href="/bank" className="block">
        <Card className="border hover:bg-accent/50 transition-colors cursor-pointer">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Banknote className="h-4 w-4" />
                <span>Banks connected. Reconciliation pending for 1 account.</span>
              </div>
              <Link2 className="h-4 w-4 text-muted-foreground" />
            </div>
        </CardContent>
      </Card>
      </Link>
    </div>
  );
}

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
import { Banknote, Link2, TrendingUp, TrendingDown } from "lucide-react";
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
  getLastMonth,
  getCurrentQuarter,
  getPreviousQuarter,
  getLastQuarter,
  getCurrentYear,
  getPreviousYear,
  getLastYear,
  getPreviousPeriodRange,
  getSamePeriodLastYear,
  calculateComparison,
  type DateRange,
} from "@/lib/utils/period-comparison";
import { DashboardFilters, type PeriodMode, type CompareMode } from "@/components/dashboard/dashboard-filters";
import { AIRecommendations } from "@/components/dashboard/ai-recommendations";
import { getDashboardRecommendations } from "@/lib/insights/recommendations";
import { getMultiPeriodData, getLastNMonths, getLastNQuarters, getLastNYears, getMultiPeriodFromCustomRange } from "@/lib/data/multi-period-comparison";
import { RevenueExpenseChartMulti } from "@/components/dashboard/revenue-expense-chart-multi";
import { 
  buildFilterContract, 
  deriveRanges, 
  getRevenueTrendChart, 
  getExpenseTrendChart, 
  getCashFlowChart,
  getARAPAgeingChart,
  getProfitabilityChart
} from "@/lib/data/dashboard-metrics-service";
import { DashboardWrapper } from "@/components/dashboard/dashboard-wrapper";
import { getCurrentUser } from "@/lib/data/users";
import { getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import { normaliseCurrencyCode } from "@/lib/currencies";

export const revalidate = 60;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ 
    periodMode?: PeriodMode;
    startDate?: string; 
    endDate?: string; 
    compareMode?: CompareMode;
    multiN?: string;
    multiUnit?: "MONTH" | "QUARTER" | "YEAR";
    currency?: string;
    // Legacy params for backward compatibility
    period?: string;
    compare?: "previous" | "lastYear";
    periodCount?: string;
    periodType?: "months" | "quarters" | "years";
  }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const baseCurrency = user?.tenant
    ? await getTenantBaseCurrency(user.tenant.id)
    : "USD";

  // New filter structure (with fallback to legacy)
  const periodMode: PeriodMode = params.periodMode || 
    (params.period === "quarter" ? "THIS_QUARTER" : 
     params.period === "year" ? "THIS_YEAR" : "THIS_MONTH");
  const startDate = params.startDate;
  const endDate = params.endDate;
  const compareMode: CompareMode = params.compareMode || 
    (params.compare === "lastYear" ? "SPLY" : 
     params.compare === "previous" ? "PREVIOUS" : "NONE");
  const multiN = (params.multiN ? parseInt(params.multiN, 10) : parseInt(params.periodCount || "3", 10)) as 3 | 6 | 12;
  const multiUnit: "MONTH" | "QUARTER" | "YEAR" = params.multiUnit || 
    (params.periodType === "quarters" ? "QUARTER" : 
     params.periodType === "years" ? "YEAR" : "MONTH");
  const rawCurrency = params.currency;
  // Normalise typos (e.g. ALD, ATD → AED). "all" / empty stay as-is.
  const currency =
    rawCurrency && rawCurrency !== "all"
      ? normaliseCurrencyCode(rawCurrency)
      : rawCurrency;
  // "all" = no conversion (show base). Pass undefined so buildFilterContract uses base.
  const currencyForFetch = currency && currency !== "all" ? currency : undefined;
  /** Display currency for formatting: symbol matches converted amounts. */
  const displayCurrency = currencyForFetch ?? baseCurrency;

  // Determine if multi-period mode is enabled
  const isMultiPeriodMode = compareMode === "MULTI";

  // Handle errors gracefully - if data fetching fails, show empty state
  const defaultPeriodData: PeriodFinancialData = {
    revenue: 0,
    expenses: 0,
    netIncome: 0,
    cashBalance: 0,
    receivables: 0,
    payables: 0,
    cashFlow: 0,
  };

  let pulse: FinancialPulse;
  let signals: AttentionSignal[];
  let events: RecentFinancialEvent[];
  let currentPeriodData: PeriodFinancialData = defaultPeriodData;
  let previousPeriodData: PeriodFinancialData = defaultPeriodData;
  let multiPeriodData: Awaited<ReturnType<typeof getMultiPeriodData>> | null = null;
  
  // New unified chart data (using new service)
  let revenueChartData: Awaited<ReturnType<typeof getRevenueTrendChart>> | null = null;
  let expenseChartData: Awaited<ReturnType<typeof getExpenseTrendChart>> | null = null;
  let cashFlowChartData: Awaited<ReturnType<typeof getCashFlowChart>> | null = null;
  let ageingChartData: Awaited<ReturnType<typeof getARAPAgeingChart>> | null = null;
  let profitabilityChartData: Awaited<ReturnType<typeof getProfitabilityChart>> | null = null;
  
  try {
    // Build filter contract and derive ranges for new chart service
    try {
      const filterContract = await buildFilterContract(
        periodMode,
        startDate,
        endDate,
        compareMode,
        multiN,
        multiUnit,
        currencyForFetch
      );
      const ranges = deriveRanges(filterContract);
      
      // Fetch new chart data in parallel
      [revenueChartData, expenseChartData, cashFlowChartData, ageingChartData, profitabilityChartData] = await Promise.all([
        getRevenueTrendChart(filterContract, ranges).catch(err => {
          console.error("Failed to fetch revenue chart:", err);
          return null;
        }),
        getExpenseTrendChart(filterContract, ranges).catch(err => {
          console.error("Failed to fetch expense chart:", err);
          return null;
        }),
        getCashFlowChart(filterContract, ranges).catch(err => {
          console.error("Failed to fetch cash flow chart:", err);
          return null;
        }),
        getARAPAgeingChart(filterContract, ranges).catch(err => {
          console.error("Failed to fetch ageing chart:", err);
          return null;
        }),
        getProfitabilityChart(filterContract, ranges).catch(err => {
          console.error("Failed to fetch profitability chart:", err);
          return null;
        }),
      ]);
    } catch (chartError) {
      console.error("Failed to build filter contract or fetch chart data:", chartError);
      // Continue with legacy data fetching
    }
    // Get current period based on periodMode
    let currentPeriod: DateRange;
    
    if (periodMode === "CUSTOM" && startDate && endDate) {
      // Custom date range
      currentPeriod = {
        startDate,
        endDate,
      };
    } else {
      // Preset periods
      switch (periodMode) {
        case "THIS_QUARTER":
          currentPeriod = getCurrentQuarter();
          break;
        case "THIS_YEAR":
          currentPeriod = getCurrentYear();
          break;
        case "LAST_MONTH":
          currentPeriod = getLastMonth();
          break;
        case "LAST_QUARTER":
          currentPeriod = getLastQuarter();
          break;
        case "LAST_YEAR":
          currentPeriod = getLastYear();
          break;
        default: // "THIS_MONTH"
          currentPeriod = getCurrentMonth();
      }
    }
    
    // Get comparison period based on compareMode
    let comparisonPeriod: DateRange | null = null;
    
    if (compareMode === "PREVIOUS") {
      comparisonPeriod = getPreviousPeriodRange(currentPeriod.startDate, currentPeriod.endDate);
    } else if (compareMode === "SPLY") {
      comparisonPeriod = getSamePeriodLastYear(currentPeriod.startDate, currentPeriod.endDate);
    }
    // NONE and MULTI don't need comparisonPeriod
    
    // Fetch data based on mode
    
    if (isMultiPeriodMode) {
      // Multi-period mode: fetch data for N periods
      let dateRanges: Array<{ label: string; dateRange: DateRange }>;
      
      if (periodMode === "CUSTOM" && startDate && endDate) {
        // Multi-period from custom range
        dateRanges = getMultiPeriodFromCustomRange(
          currentPeriod,
          multiN,
          multiUnit
        );
      } else {
        // Multi-period from preset periods
        if (multiUnit === "QUARTER") {
          dateRanges = getLastNQuarters(multiN);
        } else if (multiUnit === "YEAR") {
          dateRanges = getLastNYears(multiN);
        } else {
          dateRanges = getLastNMonths(multiN);
        }
      }
      
      const [pulseResult, signalsResult, eventsResult, multiPeriodResult] = await Promise.all([
        getFinancialPulse(currencyForFetch),
        getAttentionSignals(currencyForFetch),
        getRecentFinancialEvents(5, currencyForFetch),
        getMultiPeriodData(dateRanges, currencyForFetch),
      ]);
      
      pulse = pulseResult;
      signals = signalsResult;
      events = eventsResult;
      multiPeriodData = multiPeriodResult;
      
      // Use last period as current, second-to-last as previous for comparisons
      if (multiPeriodResult.periods.length > 0) {
        currentPeriodData = multiPeriodResult.periods[multiPeriodResult.periods.length - 1].data;
        previousPeriodData = multiPeriodResult.periods.length > 1 
          ? multiPeriodResult.periods[multiPeriodResult.periods.length - 2].data
          : currentPeriodData;
      } else {
        // Fallback if no periods
        currentPeriodData = defaultPeriodData;
        previousPeriodData = defaultPeriodData;
      }
    } else {
      // Standard 2-period mode (or NONE comparison)
      const dataPromises = [
        getFinancialPulse(currencyForFetch),
        getAttentionSignals(currencyForFetch),
        getRecentFinancialEvents(5, currencyForFetch),
        getPeriodFinancialData(currentPeriod, currencyForFetch),
      ];
      
      if (comparisonPeriod) {
        dataPromises.push(getPeriodFinancialData(comparisonPeriod, currencyForFetch));
      } else {
        dataPromises.push(Promise.resolve(defaultPeriodData));
      }
      
      const results = await Promise.all(dataPromises);
      pulse = results[0] as FinancialPulse;
      signals = results[1] as AttentionSignal[];
      events = results[2] as RecentFinancialEvent[];
      currentPeriodData = results[3] as PeriodFinancialData;
      previousPeriodData = results[4] as PeriodFinancialData;
    }
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
    previousPeriodData = defaultPeriodData;
  }

  // Calculate comparisons for charts (needed even if not used in multi-period mode)
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

  // Get structured recommendations
  let structuredRecommendations: Awaited<ReturnType<typeof getDashboardRecommendations>> = [];
  try {
    const daysInPeriod = startDate && endDate
      ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
      : periodMode === "THIS_QUARTER" || periodMode === "LAST_QUARTER" ? 90 
      : periodMode === "THIS_YEAR" || periodMode === "LAST_YEAR" ? 365 
      : 30;
    
    structuredRecommendations = await getDashboardRecommendations(
      currentPeriodData,
      previousPeriodData,
      revenueComparison,
      expenseComparison,
      cashFlowComparison,
      netIncomeComparison,
      arComparison,
      apComparison,
      daysInPeriod,
      displayCurrency,
    );
  } catch (error) {
    console.error("Failed to generate recommendations:", error);
  }

  return (
    <DashboardWrapper>
      <div className="space-y-6 pb-6">
        {/* Dashboard Filters */}
        <DashboardFilters
        initialPeriodMode={periodMode}
        initialStartDate={startDate}
        initialEndDate={endDate}
        initialCompareMode={compareMode}
        initialMultiN={multiN}
        initialMultiUnit={multiUnit}
        initialCurrency={currency}
        baseCurrency={baseCurrency}
        currencies={[]}
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
            {isMultiPeriodMode && multiPeriodData ? (
              <RevenueExpenseChartMulti multiPeriodData={multiPeriodData} displayCurrency={displayCurrency} />
            ) : revenueChartData && expenseChartData ? (
              <RevenueExpenseChart
                revenueChart={revenueChartData}
                expenseChart={expenseChartData}
                displayCurrency={displayCurrency}
              />
            ) : (
              <RevenueExpenseChart
                currentRevenue={currentPeriodData.revenue}
                previousRevenue={previousPeriodData.revenue}
                currentExpenses={currentPeriodData.expenses}
                previousExpenses={previousPeriodData.expenses}
                revenueComparison={revenueComparison}
                expenseComparison={expenseComparison}
                displayCurrency={displayCurrency}
              />
            )}
            <div className="flex flex-col gap-4 h-full">
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle className="text-base">Revenue & Expense Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Current Revenue</span>
                      <span className="text-sm font-semibold">{formatCurrency(currentPeriodData.revenue, displayCurrency)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Current Expenses</span>
                      <span className="text-sm font-semibold">{formatCurrency(currentPeriodData.expenses, displayCurrency)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Net Income</span>
                      <span className={`text-sm font-bold ${currentPeriodData.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(currentPeriodData.netIncome, displayCurrency)}
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
            {cashFlowChartData ? (
              <CashFlowChart cashFlowChart={cashFlowChartData} displayCurrency={displayCurrency} />
            ) : (
              <CashFlowChart
                currentCashFlow={currentPeriodData.cashFlow}
                previousCashFlow={previousPeriodData.cashFlow}
                comparison={cashFlowComparison}
                displayCurrency={displayCurrency}
              />
            )}
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
                        {formatCurrency(currentPeriodData.cashFlow, displayCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Previous Cash Flow</span>
                      <span className="text-sm font-medium">{formatCurrency(previousPeriodData.cashFlow, displayCurrency)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Cash Balance</span>
                      <span className="text-sm font-bold">{formatCurrency(currentPeriodData.cashBalance, displayCurrency)}</span>
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
            {ageingChartData ? (
              <ARAPAgeingChart ageingData={ageingChartData} displayCurrency={displayCurrency} />
            ) : (
              <ARAPAgeingChart
                currentAR={currentPeriodData.receivables}
                previousAR={previousPeriodData.receivables}
                currentAP={currentPeriodData.payables}
                previousAP={previousPeriodData.payables}
                arComparison={arComparison}
                apComparison={apComparison}
                displayCurrency={displayCurrency}
              />
            )}
            <div className="flex flex-col gap-4 h-full">
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle className="text-base">AR/AP Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Receivables (AR)</span>
                      <span className="text-sm font-semibold">{formatCurrency(currentPeriodData.receivables, displayCurrency)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Payables (AP)</span>
                      <span className="text-sm font-semibold">{formatCurrency(currentPeriodData.payables, displayCurrency)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Net Working Capital</span>
                      <span className={`text-sm font-bold ${(currentPeriodData.receivables - currentPeriodData.payables) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(currentPeriodData.receivables - currentPeriodData.payables, displayCurrency)}
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
            {profitabilityChartData && revenueChartData ? (
              <ProfitabilityChart
                profitabilityChart={profitabilityChartData}
                revenueChart={revenueChartData}
                displayCurrency={displayCurrency}
              />
            ) : (
              <ProfitabilityChart
                currentRevenue={currentPeriodData.revenue}
                previousRevenue={previousPeriodData.revenue}
                currentNetIncome={currentPeriodData.netIncome}
                previousNetIncome={previousPeriodData.netIncome}
                netIncomeComparison={netIncomeComparison}
                displayCurrency={displayCurrency}
              />
            )}
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
                        {formatCurrency(currentPeriodData.netIncome, displayCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Revenue</span>
                      <span className="text-sm font-medium">{formatCurrency(currentPeriodData.revenue, displayCurrency)}</span>
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
      <AIRecommendations recommendations={structuredRecommendations} />

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
    </DashboardWrapper>
  );
}

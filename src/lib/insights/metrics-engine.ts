/**
 * Metrics Engine for CFO-Grade Recommendations
 * 
 * Rule-based financial intelligence that computes deltas, ratios, thresholds deterministically.
 * AI only explains and prioritizes - all calculations are deterministic.
 * 
 * Follows structure: Observation → Risk/Opportunity → Action → Impact
 */

import type { PeriodFinancialData } from "@/lib/data/period-comparison";
import type { PeriodComparison } from "@/lib/utils/period-comparison";
import { getARAgeingSummary, getAPAgeingSummary } from "@/lib/data/ageing";
import { formatCurrency } from "@/lib/format";

export interface StructuredRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  observation: string;
  riskOrOpportunity: string;
  action: string;
  impact: string;
  metrics: {
    currentValue: number;
    previousValue?: number;
    change?: number;
    changePercent?: number;
    threshold?: number;
  };
  drillDownPath?: string;
}

/**
 * Calculate AR Days (Accounts Receivable Days)
 * Formula: (AR / Revenue) * Days in Period
 */
function calculateARDays(
  receivables: number,
  revenue: number,
  daysInPeriod: number,
): number {
  if (revenue === 0) return 0;
  return (receivables / revenue) * daysInPeriod;
}

/**
 * Calculate AP Days (Accounts Payable Days)
 * Formula: (AP / Expenses) * Days in Period
 */
function calculateAPDays(
  payables: number,
  expenses: number,
  daysInPeriod: number,
): number {
  if (expenses === 0) return 0;
  return (payables / expenses) * daysInPeriod;
}

/**
 * Generate structured recommendations based on financial metrics
 * @param displayCurrency - Currency for formatting amounts (symbol)
 */
export async function generateStructuredRecommendations(
  currentPeriod: PeriodFinancialData,
  previousPeriod: PeriodFinancialData,
  revenueComparison: PeriodComparison,
  expenseComparison: PeriodComparison,
  cashFlowComparison: PeriodComparison,
  netIncomeComparison: PeriodComparison,
  arComparison: PeriodComparison,
  apComparison: PeriodComparison,
  daysInPeriod: number = 30,
  displayCurrency: string = "AED",
): Promise<StructuredRecommendation[]> {
  const recommendations: StructuredRecommendation[] = [];

  // Get AR/AP ageing data for specific recommendations
  const [arAgeingSummary, apAgeingSummary] = await Promise.all([
    getARAgeingSummary(),
    getAPAgeingSummary(),
  ]);

  // Calculate AR Days
  const currentARDays = calculateARDays(
    currentPeriod.receivables,
    currentPeriod.revenue,
    daysInPeriod,
  );
  const previousARDays = calculateARDays(
    previousPeriod.receivables,
    previousPeriod.revenue,
    daysInPeriod,
  );
  const arDaysChange = currentARDays - previousARDays;

  // Calculate overdue receivables
  const overdueAR = arAgeingSummary.reduce(
    (sum, customer) =>
      sum + customer.total_31_60 + customer.total_61_90 + customer.total_90_plus,
    0,
  );
  const topOverdueCustomers = arAgeingSummary
    .map((c) => ({
      name: c.customer_name || "Unknown",
      overdue: c.total_31_60 + c.total_61_90 + c.total_90_plus,
    }))
    .filter((c) => c.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 3);

  // AR Days Recommendation
  if (arDaysChange > 5 && currentARDays > 30) {
    const top2Overdue = topOverdueCustomers.slice(0, 2).reduce((sum, c) => sum + c.overdue, 0);
    const top2Percentage = overdueAR > 0 ? (top2Overdue / overdueAR) * 100 : 0;
    const cashImpact = overdueAR;

    recommendations.push({
      id: "ar-days-increase",
      priority: "high",
      observation: `AR days increased from ${Math.round(previousARDays)} → ${Math.round(currentARDays)} days`,
      riskOrOpportunity: `This is slowing cash inflow by ~${formatCurrency(cashImpact, displayCurrency)}`,
      action: topOverdueCustomers.length > 0
        ? `Focus on customers overdue >30 days. ${topOverdueCustomers.length > 1 && top2Percentage >= 70
            ? `${topOverdueCustomers.length} customers account for ${Math.round(top2Percentage)}%. Follow up ${topOverdueCustomers[0].name} first (${formatCurrency(topOverdueCustomers[0].overdue, displayCurrency)} overdue).`
            : `Follow up ${topOverdueCustomers[0].name} first (${formatCurrency(topOverdueCustomers[0].overdue, displayCurrency)} overdue).`}`
        : "Review all overdue invoices and follow up with customers.",
      impact: `Expected cash recovery: 2–3 weeks with active follow-up. This will improve cash flow by ~${formatCurrency(cashImpact, displayCurrency)}.`,
      metrics: {
        currentValue: currentARDays,
        previousValue: previousARDays,
        change: arDaysChange,
        changePercent: previousARDays > 0 ? (arDaysChange / previousARDays) * 100 : 0,
        threshold: 30,
      },
      drillDownPath: "/insights/receivables",
    });
  }

  // Cash Flow Recommendation
  if (currentPeriod.cashFlow < 0) {
    const cashDeficit = Math.abs(currentPeriod.cashFlow);
    const runwayWeeks = currentPeriod.cashBalance > 0
      ? Math.round((currentPeriod.cashBalance / Math.abs(currentPeriod.cashFlow)) * (daysInPeriod / 7))
      : 0;

    recommendations.push({
      id: "negative-cash-flow",
      priority: "high",
      observation: `Cash flow is negative: ${formatCurrency(currentPeriod.cashFlow, displayCurrency)}`,
      riskOrOpportunity: `Burning ${formatCurrency(cashDeficit, displayCurrency)} per period. ${runwayWeeks > 0
          ? `At this rate, cash will run out in ~${runwayWeeks} weeks.`
          : "Immediate action required."}`,
      action: `1) Accelerate receivables collection (${overdueAR > 0 ? formatCurrency(overdueAR, displayCurrency) : "review"} overdue), 2) Defer non-critical expenses, 3) Consider short-term financing if needed.`,
      impact: `Improving collections could recover ${formatCurrency(overdueAR, displayCurrency)} within 2-3 weeks, extending runway by ${Math.round((overdueAR / cashDeficit) * (daysInPeriod / 7))} weeks.`,
      metrics: {
        currentValue: currentPeriod.cashFlow,
        threshold: 0,
      },
      drillDownPath: "/insights/receivables",
    });
  } else if (cashFlowComparison.direction === "down" && cashFlowComparison.percentageChange < -20) {
    const cashFlowDecline = Math.abs(cashFlowComparison.absoluteChange ?? cashFlowComparison.difference);

    recommendations.push({
      id: "declining-cash-flow",
      priority: "medium",
      observation: `Cash flow decreased by ${Math.abs(cashFlowComparison.percentageChange).toFixed(1)}% (${formatCurrency(cashFlowDecline, displayCurrency)})`,
      riskOrOpportunity: "Cash generation is slowing, which may impact operational flexibility.",
      action: `Review receivables collection (${overdueAR > 0 ? `${formatCurrency(overdueAR, displayCurrency)} overdue` : "check ageing report"}) and payment terms. Consider negotiating better payment terms with suppliers.`,
      impact: `Improving collection by 10% could recover ~${formatCurrency(overdueAR * 0.1, displayCurrency)} within 2-3 weeks.`,
      metrics: {
        currentValue: currentPeriod.cashFlow,
        previousValue: previousPeriod.cashFlow,
        change: -cashFlowDecline,
        changePercent: cashFlowComparison.percentageChange,
      },
      drillDownPath: "/insights/receivables",
    });
  }

  // Revenue Decline Recommendation
  if (revenueComparison.direction === "down" && revenueComparison.percentageChange < -10) {
    const revenueDecline = Math.abs(revenueComparison.absoluteChange ?? revenueComparison.difference);

    recommendations.push({
      id: "revenue-decline",
      priority: "high",
      observation: `Revenue decreased by ${Math.abs(revenueComparison.percentageChange).toFixed(1)}% (${formatCurrency(revenueDecline, displayCurrency)})`,
      riskOrOpportunity: `This represents ${formatCurrency(revenueDecline, displayCurrency)} in lost revenue. If this trend continues, profitability will be impacted.`,
      action: "1) Review sales channels and identify underperforming areas, 2) Analyze customer acquisition costs, 3) Consider pricing strategy review, 4) Focus on high-value customer retention.",
      impact: `Reversing this decline could add ${formatCurrency(revenueDecline, displayCurrency)} back to revenue. Expected timeline: 1-2 months with focused sales efforts.`,
      metrics: {
        currentValue: currentPeriod.revenue,
        previousValue: previousPeriod.revenue,
        change: -revenueDecline,
        changePercent: revenueComparison.percentageChange,
      },
      drillDownPath: "/reports/pnl?tab=pnl",
    });
  }

  // Expense Increase Recommendation
  if (expenseComparison.direction === "up" && expenseComparison.percentageChange > 20) {
    const expenseIncrease = expenseComparison.absoluteChange ?? expenseComparison.difference;

    recommendations.push({
      id: "expense-increase",
      priority: "medium",
      observation: `Expenses increased by ${expenseComparison.percentageChange.toFixed(1)}% (${formatCurrency(expenseIncrease, displayCurrency)})`,
      riskOrOpportunity: `This increase of ${formatCurrency(expenseIncrease, displayCurrency)} is reducing profitability.`,
      action: "1) Review expense categories and identify largest increases, 2) Question whether increases are necessary or can be deferred, 3) Negotiate better terms with suppliers, 4) Review subscription and recurring costs.",
      impact: `Reducing expenses by 10% could save ~${formatCurrency(expenseIncrease * 0.1, displayCurrency)} per period, improving net income.`,
      metrics: {
        currentValue: currentPeriod.expenses,
        previousValue: previousPeriod.expenses,
        change: expenseIncrease,
        changePercent: expenseComparison.percentageChange,
      },
      drillDownPath: "/reports/pnl?tab=pnl",
    });
  }

  // High Receivables Ratio Recommendation
  if (currentPeriod.receivables > currentPeriod.revenue * 0.3 && currentPeriod.revenue > 0) {
    const receivablesRatio = (currentPeriod.receivables / currentPeriod.revenue) * 100;

    recommendations.push({
      id: "high-receivables-ratio",
      priority: "medium",
      observation: `Receivables represent ${receivablesRatio.toFixed(1)}% of revenue (${formatCurrency(currentPeriod.receivables, displayCurrency)})`,
      riskOrOpportunity: "High receivables ratio indicates extended payment terms or slow collections, tying up working capital.",
      action: `1) Review credit terms with customers, 2) Implement stricter payment terms for new customers, 3) Offer early payment discounts, 4) Follow up on ${overdueAR > 0 ? `${formatCurrency(overdueAR, displayCurrency)} in overdue receivables` : "overdue invoices"}.`,
      impact: `Reducing receivables by 20% would free up ~${formatCurrency(currentPeriod.receivables * 0.2, displayCurrency)} in working capital.`,
      metrics: {
        currentValue: receivablesRatio,
        threshold: 30,
      },
      drillDownPath: "/insights/receivables",
    });
  }

  // Net Income Loss Recommendation
  if (currentPeriod.netIncome < 0) {
    const lossAmount = Math.abs(currentPeriod.netIncome);

    recommendations.push({
      id: "operating-loss",
      priority: "high",
      observation: `Operating at a loss: ${formatCurrency(currentPeriod.netIncome, displayCurrency)}`,
      riskOrOpportunity: `Losing ${formatCurrency(lossAmount, displayCurrency)} per period. This is unsustainable and requires immediate action.`,
      action: `1) Increase revenue (target: ${formatCurrency(lossAmount + currentPeriod.revenue * 0.1, displayCurrency)} to break even), 2) Reduce expenses by ${formatCurrency(lossAmount * 0.6, displayCurrency)} (focus on non-essential costs), 3) Review pricing strategy, 4) Consider cost restructuring.`,
      impact: `Breaking even would require ${formatCurrency(lossAmount, displayCurrency)} in additional revenue or expense reduction. Expected timeline: 2-3 months with focused efforts.`,
      metrics: {
        currentValue: currentPeriod.netIncome,
        threshold: 0,
      },
      drillDownPath: "/reports/pnl?tab=pnl",
    });
  }

  // Low Cash Reserve Recommendation
  if (currentPeriod.cashBalance < currentPeriod.expenses * 0.5 && currentPeriod.expenses > 0) {
    const cashReserveRatio = (currentPeriod.cashBalance / currentPeriod.expenses) * 100;
    const recommendedReserve = currentPeriod.expenses * 1.5; // 1.5 months expenses
    const shortfall = recommendedReserve - currentPeriod.cashBalance;

    recommendations.push({
      id: "low-cash-reserve",
      priority: "high",
      observation: `Cash balance (${formatCurrency(currentPeriod.cashBalance, displayCurrency)}) is ${cashReserveRatio.toFixed(0)}% of monthly expenses`,
      riskOrOpportunity: `Recommended reserve: ${formatCurrency(recommendedReserve, displayCurrency)} (1.5 months expenses). Current shortfall: ${formatCurrency(shortfall, displayCurrency)}.`,
      action: `1) Accelerate receivables collection (${overdueAR > 0 ? formatCurrency(overdueAR, displayCurrency) : "review"} overdue), 2) Secure additional funding if needed, 3) Defer non-essential expenses, 4) Negotiate extended payment terms with suppliers.`,
      impact: `Improving collections could recover ${formatCurrency(overdueAR, displayCurrency)} within 2-3 weeks, reducing shortfall to ${formatCurrency(Math.max(0, shortfall - overdueAR), displayCurrency)}.`,
      metrics: {
        currentValue: currentPeriod.cashBalance,
        threshold: recommendedReserve,
      },
      drillDownPath: "/insights/receivables",
    });
  }

  // Sort by priority (high first) and limit to top 4
  return recommendations
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 4);
}

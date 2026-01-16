"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lightbulb, TrendingUp, TrendingDown, AlertCircle, CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { PeriodComparison } from "@/lib/utils/period-comparison";
import type { PeriodFinancialData } from "@/lib/data/period-comparison";

type Props = {
  currentPeriodData: PeriodFinancialData;
  revenueComparison: PeriodComparison;
  expenseComparison: PeriodComparison;
  cashFlowComparison: PeriodComparison;
  netIncomeComparison: PeriodComparison;
  arComparison: PeriodComparison;
  apComparison: PeriodComparison;
};

export function AIRecommendations({
  currentPeriodData,
  revenueComparison,
  expenseComparison,
  cashFlowComparison,
  netIncomeComparison,
  arComparison,
  apComparison,
}: Props) {
  const recommendations: Array<{
    type: "positive" | "warning" | "info";
    icon: React.ReactNode;
    title: string;
    description: string;
  }> = [];

  // Revenue Analysis
  if (revenueComparison.direction === "down" && revenueComparison.percentageChange < -10) {
    recommendations.push({
      type: "warning",
      icon: <TrendingDown className="h-4 w-4 text-destructive" />,
      title: "Revenue Decline",
      description: `Revenue decreased by ${Math.abs(revenueComparison.percentageChange).toFixed(1)}% compared to the previous period. Review sales channels and customer acquisition strategies.`,
    });
  } else if (revenueComparison.direction === "up" && revenueComparison.percentageChange > 15) {
    recommendations.push({
      type: "positive",
      icon: <TrendingUp className="h-4 w-4 text-green-600" />,
      title: "Strong Revenue Growth",
      description: `Revenue increased by ${revenueComparison.percentageChange.toFixed(1)}%. Consider reinvesting in successful channels or expanding operations.`,
    });
  }

  // Expense Analysis
  if (expenseComparison.direction === "up" && expenseComparison.percentageChange > 20) {
    recommendations.push({
      type: "warning",
      icon: <AlertCircle className="h-4 w-4 text-destructive" />,
      title: "Expense Increase",
      description: `Expenses increased by ${expenseComparison.percentageChange.toFixed(1)}%. Review spending patterns and identify areas for cost optimization.`,
    });
  }

  // Cash Flow Analysis
  if (currentPeriodData.cashFlow < 0) {
    recommendations.push({
      type: "warning",
      icon: <AlertCircle className="h-4 w-4 text-destructive" />,
      title: "Negative Cash Flow",
      description: `Cash flow is negative (${formatCurrency(Math.abs(currentPeriodData.cashFlow))}). Monitor closely and consider increasing collection efforts or reducing expenses.`,
    });
  } else if (cashFlowComparison.direction === "down" && cashFlowComparison.percentageChange < -20) {
    recommendations.push({
      type: "warning",
      icon: <TrendingDown className="h-4 w-4 text-orange-600" />,
      title: "Declining Cash Flow",
      description: `Cash flow decreased by ${Math.abs(cashFlowComparison.percentageChange).toFixed(1)}%. Review receivables collection and payment terms.`,
    });
  }

  // AR Analysis
  if (arComparison.direction === "up" && arComparison.percentageChange > 25) {
    recommendations.push({
      type: "warning",
      icon: <AlertCircle className="h-4 w-4 text-orange-600" />,
      title: "Growing Receivables",
      description: `Accounts receivable increased by ${arComparison.percentageChange.toFixed(1)}%. Follow up on outstanding invoices to improve collection.`,
    });
  } else if (currentPeriodData.receivables > currentPeriodData.revenue * 0.3) {
    recommendations.push({
      type: "info",
      icon: <Lightbulb className="h-4 w-4 text-blue-600" />,
      title: "High Receivables Ratio",
      description: `Receivables represent ${((currentPeriodData.receivables / currentPeriodData.revenue) * 100).toFixed(1)}% of revenue. Consider reviewing credit terms.`,
    });
  }

  // AP Analysis
  if (apComparison.direction === "up" && apComparison.percentageChange > 30) {
    recommendations.push({
      type: "warning",
      icon: <AlertCircle className="h-4 w-4 text-orange-600" />,
      title: "Increasing Payables",
      description: `Accounts payable increased by ${apComparison.percentageChange.toFixed(1)}%. Ensure sufficient cash reserves for upcoming payments.`,
    });
  }

  // Net Income Analysis
  if (netIncomeComparison.direction === "up" && netIncomeComparison.percentageChange > 20) {
    recommendations.push({
      type: "positive",
      icon: <CheckCircle className="h-4 w-4 text-green-600" />,
      title: "Improved Profitability",
      description: `Net income improved by ${netIncomeComparison.percentageChange.toFixed(1)}%. Strong performance - maintain current strategies.`,
    });
  } else if (currentPeriodData.netIncome < 0) {
    recommendations.push({
      type: "warning",
      icon: <AlertCircle className="h-4 w-4 text-destructive" />,
      title: "Operating at Loss",
      description: `Net income is negative. Review revenue streams and cost structure. Consider pricing adjustments or expense reduction initiatives.`,
    });
  }

  // Cash Balance Low Warning
  if (currentPeriodData.cashBalance < currentPeriodData.expenses * 0.5) {
    recommendations.push({
      type: "warning",
      icon: <AlertCircle className="h-4 w-4 text-destructive" />,
      title: "Low Cash Reserve",
      description: `Cash balance (${formatCurrency(currentPeriodData.cashBalance)}) may be insufficient. Consider securing additional funding or improving collections.`,
    });
  }

  // Limit to top 4 recommendations
  const topRecommendations = recommendations.slice(0, 4);

  if (topRecommendations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            AI Recommendations
          </CardTitle>
          <CardDescription>
            Contextual insights based on your financial data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <p>No urgent recommendations at this time. Your financial metrics are stable.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          AI Recommendations
        </CardTitle>
        <CardDescription>
          Contextual insights based on your financial data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {topRecommendations.map((rec, idx) => (
          <div
            key={idx}
            className={`flex gap-3 p-3 rounded-lg border ${
              rec.type === "warning"
                ? "border-destructive/20 bg-destructive/5"
                : rec.type === "positive"
                ? "border-green-200 bg-green-50"
                : "border-blue-200 bg-blue-50"
            }`}
          >
            <div className="flex-shrink-0 mt-0.5">{rec.icon}</div>
            <div className="flex-1 space-y-1">
              <h4 className="text-sm font-semibold">{rec.title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{rec.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

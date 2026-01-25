/**
 * Structured Recommendations Generator
 * 
 * Formats recommendations in the required structure:
 * Observation → Risk/Opportunity → Action → Impact
 */

import { generateStructuredRecommendations } from "./metrics-engine";
import type { StructuredRecommendation } from "./metrics-engine";
import type { PeriodFinancialData } from "@/lib/data/period-comparison";
import type { PeriodComparison } from "@/lib/utils/period-comparison";

export type { StructuredRecommendation };

/**
 * Get structured recommendations for dashboard
 * @param displayCurrency - Currency for formatting amounts (e.g. from CurrencyFilter)
 */
export async function getDashboardRecommendations(
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
  return await generateStructuredRecommendations(
    currentPeriod,
    previousPeriod,
    revenueComparison,
    expenseComparison,
    cashFlowComparison,
    netIncomeComparison,
    arComparison,
    apComparison,
    daysInPeriod,
    displayCurrency,
  );
}

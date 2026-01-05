import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { ReportsTabs } from "@/components/reports/reports-tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getProfitAndLoss,
  getBalanceSheet,
  getTrialBalance,
  getCashFlow,
  getJournalLedger,
  getVATReport,
} from "@/lib/data/reports";
import {
  getDetailedProfitAndLoss,
  getDetailedBalanceSheet,
  getDetailedCashFlow,
} from "@/lib/data/reports-detailed";
type JournalLedgerRow = {
  tenant_id: string;
  entry_id: string;
  date: string;
  description: string;
  status: string;
  created_at: string;
  account_code: string;
  account_name: string;
  debit: number | null;
  credit: number | null;
  memo: string | null;
};
import { formatCurrency, formatDate } from "@/lib/format";
import Link from "next/link";
import { ReportFilters } from "@/components/reports/report-filters";
import { ExportButtons } from "@/components/reports/export-buttons";
import { ARAgeingTable } from "@/components/reports/ar-ageing-table";
import { APAgeingTable } from "@/components/reports/ap-ageing-table";
import { GroupedARAgeingTable } from "@/components/reports/grouped-ar-ageing-table";
import { GroupedAPAgeingTable } from "@/components/reports/grouped-ap-ageing-table";
import { PeriodComparisonDisplay } from "@/components/reports/period-comparison";
import { RevenueChart } from "@/components/reports/revenue-chart";
import { TrialBalanceTable } from "@/components/reports/trial-balance-table";
import { GroupedLedgerTable } from "@/components/reports/grouped-ledger-table";
import { ProfitLossTable } from "@/components/reports/profit-loss-table";
import { BalanceSheetTable } from "@/components/reports/balance-sheet-table";
import { CashFlowTable } from "@/components/reports/cash-flow-table";
import { getARAgeing, getARAgeingSummary, getAPAgeing, getAPAgeingSummary } from "@/lib/data/ageing";
import {
  getPeriodFinancialData,
  type PeriodFinancialData,
} from "@/lib/data/period-comparison";
import {
  getCurrentMonth,
  getPreviousMonth,
  calculateComparison,
} from "@/lib/utils/period-comparison";

export const revalidate = 120;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const defaultTab = params.tab || "pnl";
  
  // Get current and previous month data for period comparisons
  const currentMonth = getCurrentMonth();
  const previousMonth = getPreviousMonth();
  
  const [
    pnl,
    balanceSheet,
    trialBalance,
    cashFlow,
    journalLedger,
    vatReport,
    arAgeing,
    arAgeingSummary,
    apAgeing,
    apAgeingSummary,
    currentPeriodData,
    previousPeriodData,
    detailedPnl,
    detailedBalanceSheet,
    detailedCashFlow,
  ] = await Promise.all([
    getProfitAndLoss(),
    getBalanceSheet(),
    getTrialBalance(),
    getCashFlow(),
    getJournalLedger(params.startDate, params.endDate),
    getVATReport(),
    getARAgeing(),
    getARAgeingSummary(),
    getAPAgeing(),
    getAPAgeingSummary(),
    getPeriodFinancialData(currentMonth),
    getPeriodFinancialData(previousMonth),
    getDetailedProfitAndLoss(),
    getDetailedBalanceSheet(),
    getDetailedCashFlow(),
  ]);

  // Calculate period comparisons
  const revenueComparison = calculateComparison(
    currentPeriodData.revenue,
    previousPeriodData.revenue,
  );
  const expenseComparison = calculateComparison(
    currentPeriodData.expenses,
    previousPeriodData.expenses,
  );
  const netIncomeComparison = calculateComparison(
    currentPeriodData.netIncome,
    previousPeriodData.netIncome,
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Financial Reports</h2>
        <p className="text-sm text-muted-foreground">
          Real-time financial reports derived from posted journal entries. Use filters to adjust date ranges.
        </p>
      </div>
      
      {/* Report Filters - Available for all tabs */}
      <Card>
        <CardContent className="pt-6">
          <ReportFilters
            initialStartDate={params.startDate}
            initialEndDate={params.endDate}
          />
        </CardContent>
      </Card>

      <ReportsTabs defaultTab={defaultTab}>
        <TabsContent value="pnl">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Profit &amp; Loss Statement</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Complete profit and loss statement with all line items. Click any amount to view ledger transactions.
                </p>
              </div>
              <ExportButtons
                data={{
                  title: "Profit-and-Loss",
                  headers: ["Code", "Account", "Amount"],
                  rows: [
                    ...detailedPnl.revenue.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Total Revenue", detailedPnl.totals.totalRevenue],
                    ...detailedPnl.costOfSales.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Total Cost of Sales", detailedPnl.totals.totalCostOfSales],
                    ["", "Gross Profit", detailedPnl.totals.grossProfit],
                    ...detailedPnl.operatingExpenses.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Total Operating Expenses", detailedPnl.totals.totalOperatingExpenses],
                    ["", "Operating Profit", detailedPnl.totals.operatingProfit],
                    ...detailedPnl.otherIncome.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Total Other Income", detailedPnl.totals.totalOtherIncome],
                    ["", "Gain/Loss on Disposal", detailedPnl.totals.gainLossOnDisposal],
                    ["", "Net Profit", detailedPnl.totals.netProfit],
                  ],
                }}
              />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <div className="p-6">
                <ProfitLossTable 
                  data={detailedPnl} 
                  startDate={params.startDate}
                  endDate={params.endDate}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="balance" className="space-y-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle>Balance Sheet</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Complete balance sheet with Current/Non-Current classification. Click any amount to view ledger transactions.
                </p>
              </div>
              <ExportButtons
                data={{
                  title: "Balance-Sheet",
                  headers: ["Code", "Account", "Amount"],
                  rows: [
                    ...detailedBalanceSheet.currentAssets.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Total Current Assets", detailedBalanceSheet.totals.totalCurrentAssets],
                    ...detailedBalanceSheet.nonCurrentAssets.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Total Non-Current Assets", detailedBalanceSheet.totals.totalNonCurrentAssets],
                    ["", "TOTAL ASSETS", detailedBalanceSheet.totals.totalAssets],
                    ...detailedBalanceSheet.currentLiabilities.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Total Current Liabilities", detailedBalanceSheet.totals.totalCurrentLiabilities],
                    ...detailedBalanceSheet.nonCurrentLiabilities.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Total Non-Current Liabilities", detailedBalanceSheet.totals.totalNonCurrentLiabilities],
                    ["", "Total Liabilities", detailedBalanceSheet.totals.totalLiabilities],
                    ...detailedBalanceSheet.equity.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Total Equity", detailedBalanceSheet.totals.totalEquity],
                    ["", "TOTAL LIABILITIES & EQUITY", detailedBalanceSheet.totals.totalLiabilitiesAndEquity],
                  ],
                }}
              />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <div className="p-6">
                <BalanceSheetTable 
                  data={detailedBalanceSheet} 
                  startDate={params.startDate}
                  endDate={params.endDate}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="cashflow" className="space-y-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle>Cash Flow Statement</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Cash flow statement by activity type. Click any amount to view ledger transactions.
                </p>
              </div>
              <ExportButtons
                data={{
                  title: "Cash-Flow",
                  headers: ["Code", "Account", "Amount"],
                  rows: [
                    ...detailedCashFlow.operating.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Net Cash from Operating Activities", detailedCashFlow.totals.operatingCashFlow],
                    ...detailedCashFlow.investing.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Net Cash from Investing Activities", detailedCashFlow.totals.investingCashFlow],
                    ...detailedCashFlow.financing.map((item) => [item.account_code, item.account_name, item.amount]),
                    ["", "Net Cash from Financing Activities", detailedCashFlow.totals.financingCashFlow],
                    ["", "Net Cash Flow", detailedCashFlow.totals.netCashFlow],
                  ],
                }}
              />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <div className="p-6">
                <CashFlowTable 
                  data={detailedCashFlow} 
                  startDate={params.startDate}
                  endDate={params.endDate}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ledger">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Journal Ledger</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  All journal entries and transactions. Use the filters above to adjust date ranges.
                </p>
              </div>
              <ExportButtons
                data={{
                  title: "Journal-Ledger",
                  headers: ["Date", "Description", "Account Code", "Account Name", "Debit", "Credit", "Memo"],
                  rows: journalLedger.map((entry: JournalLedgerRow, idx: number) => [
                    entry.date,
                    entry.description,
                    entry.account_code,
                    entry.account_name,
                    Number(entry.debit ?? 0),
                    Number(entry.credit ?? 0),
                    entry.memo ?? "",
                  ]),
                }}
              />
            </CardHeader>
            <CardContent className="overflow-hidden rounded-md border p-0">
              {journalLedger.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No journal entries found for the selected date range.
                </div>
              ) : (
                <GroupedLedgerTable data={journalLedger} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="vat">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>VAT Report</CardTitle>
              <ExportButtons
                data={{
                  title: "VAT-Report",
                  headers: ["Metric", "Amount"],
                  rows: [
                    ["VAT Output Tax", Number(vatReport?.vat_output_tax ?? 0)],
                    ["VAT Input Tax", Number(vatReport?.vat_input_tax ?? 0)],
                    ["VAT Payable", Number(vatReport?.vat_payable ?? 0)],
                  ],
                }}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <ReportRow label="VAT Output Tax" value={vatReport?.vat_output_tax} />
              <ReportRow label="VAT Input Tax" value={vatReport?.vat_input_tax} />
              <div className="border-t pt-4">
                <ReportRow label="VAT Payable" value={vatReport?.vat_payable} highlight />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="trial">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Trial Balance</CardTitle>
              <ExportButtons
                data={{
                  title: "Trial-Balance",
                  headers: ["Code", "Account", "Type", "Debit", "Credit"],
                  rows: trialBalance.map((row) => [
                    row.code ?? "",
                    row.name ?? "",
                    row.type ?? "",
                    Number(row.total_debit ?? 0),
                    Number(row.total_credit ?? 0),
                  ]),
                }}
              />
            </CardHeader>
            <CardContent className="overflow-hidden rounded-md border p-0">
              {trialBalance.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No posted journal entries yet.
                </div>
              ) : (
                <TrialBalanceTable data={trialBalance} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ar">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Accounts Receivable Ageing</CardTitle>
              <ExportButtons
                data={{
                  title: "AR-Ageing",
                  headers: [
                    "Customer",
                    "Invoice #",
                    "Due Date",
                    "Days Overdue",
                    "Current (0-30)",
                    "31-60 Days",
                    "61-90 Days",
                    "90+ Days",
                    "Outstanding",
                  ],
                  rows: arAgeing.map((item) => [
                    item.customer_name,
                    item.invoice_number || "",
                    item.due_date,
                    item.days_overdue,
                    item.current_0_30,
                    item.days_31_60,
                    item.days_61_90,
                    item.days_90_plus,
                    item.outstanding_amount,
                  ]),
                }}
              />
            </CardHeader>
            <CardContent className="p-6">
              <GroupedARAgeingTable items={arAgeing} summary={arAgeingSummary} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ap">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Accounts Payable Ageing</CardTitle>
              <ExportButtons
                data={{
                  title: "AP-Ageing",
                  headers: [
                    "Vendor",
                    "Bill #",
                    "Due Date",
                    "Days Overdue",
                    "Current (0-30)",
                    "31-60 Days",
                    "61-90 Days",
                    "90+ Days",
                    "Outstanding",
                  ],
                  rows: apAgeing.map((item) => [
                    item.vendor_name,
                    item.bill_number || "",
                    item.due_date,
                    item.days_overdue,
                    item.current_0_30,
                    item.days_31_60,
                    item.days_61_90,
                    item.days_90_plus,
                    item.outstanding_amount,
                  ]),
                }}
              />
            </CardHeader>
            <CardContent className="p-6">
              <GroupedAPAgeingTable items={apAgeing} summary={apAgeingSummary} />
            </CardContent>
          </Card>
        </TabsContent>
      </ReportsTabs>
    </div>
  );
}

function ReportRow({
  label,
  value,
  highlight,
  accountCode,
}: {
  label: string;
  value?: string | number | null;
  highlight?: boolean;
  accountCode?: string;
}) {
  const amount = formatCurrency(Number(value ?? 0));
  
  // Make numbers clickable for traceability (Excel Elimination Doctrine)
  const content = (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      {accountCode ? (
        <Link
          href={`/ledger?accountCode=${accountCode}`}
          className={`hover:text-primary hover:underline decoration-dotted ${
            highlight ? "text-lg font-semibold text-primary" : "text-sm font-medium"
          }`}
          title="Click to view ledger transactions"
        >
          {amount}
        </Link>
      ) : (
        <span className={highlight ? "text-lg font-semibold text-primary" : "text-sm font-medium"}>
          {amount}
        </span>
      )}
    </div>
  );

  return content;
}

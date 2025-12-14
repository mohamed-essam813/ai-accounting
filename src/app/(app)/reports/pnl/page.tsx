import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getProfitAndLoss,
  getBalanceSheet,
  getTrialBalance,
  getCashFlow,
  getJournalLedger,
  getVATReport,
} from "@/lib/data/reports";
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
import { ReportFilters } from "@/components/reports/report-filters";
import { ExportButtons } from "@/components/reports/export-buttons";

export const revalidate = 120;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
  const params = await searchParams;
  const [pnl, balanceSheet, trialBalance, cashFlow, journalLedger, vatReport] = await Promise.all([
    getProfitAndLoss(),
    getBalanceSheet(),
    getTrialBalance(),
    getCashFlow(),
    getJournalLedger(params.startDate, params.endDate),
    getVATReport(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Financial Reports</h2>
        <p className="text-sm text-muted-foreground">
          Real-time financial reports derived from posted journal entries. Use filters to adjust date ranges.
        </p>
      </div>
      <Tabs defaultValue="pnl" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
          <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
          <TabsTrigger value="ledger">Journal Ledger</TabsTrigger>
          <TabsTrigger value="vat">VAT Report</TabsTrigger>
          <TabsTrigger value="trial">Trial Balance</TabsTrigger>
        </TabsList>
        <TabsContent value="pnl">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Profit &amp; Loss Summary</CardTitle>
              <ExportButtons
                data={{
                  title: "Profit-and-Loss",
                  headers: ["Metric", "Amount"],
                  rows: [
                    ["Total Revenue", Number(pnl?.total_revenue ?? 0)],
                    ["Total Expense", Number(pnl?.total_expense ?? 0)],
                    ["Net Income", Number(pnl?.net_income ?? 0)],
                  ],
                }}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <ReportRow label="Total Revenue" value={pnl?.total_revenue} />
              <ReportRow label="Total Expense" value={pnl?.total_expense} />
              <div className="border-t pt-4">
                <ReportRow label="Net Income" value={pnl?.net_income} highlight />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="balance">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Balance Sheet</CardTitle>
              <ExportButtons
                data={{
                  title: "Balance-Sheet",
                  headers: ["Metric", "Amount"],
                  rows: [
                    ["Assets", Number(balanceSheet?.assets ?? 0)],
                    ["Liabilities", Number(balanceSheet?.liabilities ?? 0)],
                    ["Equity", Number(balanceSheet?.equity ?? 0)],
                  ],
                }}
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <ReportRow label="Assets" value={balanceSheet?.assets} />
              <ReportRow label="Liabilities" value={balanceSheet?.liabilities} />
              <div className="border-t pt-4">
                <ReportRow label="Equity" value={balanceSheet?.equity} highlight />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="cashflow">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Cash Flow Statement</CardTitle>
              <ExportButtons
                data={{
                  title: "Cash-Flow",
                  headers: ["Metric", "Amount"],
                  rows: [["Net Cash Flow", Number(cashFlow?.net_cash_flow ?? 0)]],
                }}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <ReportRow label="Net Cash Flow" value={cashFlow?.net_cash_flow} highlight />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ledger">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Journal Ledger</CardTitle>
              <div className="flex items-center gap-2">
                <ReportFilters
                  initialStartDate={params.startDate}
                  initialEndDate={params.endDate}
                />
                <ExportButtons
                  data={{
                    title: "Journal-Ledger",
                    headers: ["Date", "Description", "Account Code", "Account Name", "Debit", "Credit", "Memo"],
                    rows:                     journalLedger.map((entry: JournalLedgerRow, idx: number) => [
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
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Account Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead>Memo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journalLedger.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                        No journal entries found for the selected date range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    journalLedger.map((entry, idx) => (
                      <TableRow key={`${entry.entry_id}-${idx}`}>
                        <TableCell className="text-sm">{formatDate(entry.date)}</TableCell>
                        <TableCell className="max-w-md">{entry.description}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.account_code}</TableCell>
                        <TableCell>{entry.account_name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {Number(entry.debit ?? 0) > 0 ? formatCurrency(Number(entry.debit), "AED") : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {Number(entry.credit ?? 0) > 0 ? formatCurrency(Number(entry.credit), "AED") : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{entry.memo ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
            <CardContent className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trialBalance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                        No posted journal entries yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    trialBalance.map((row) => (
                      <TableRow key={row.account_id}>
                        <TableCell className="font-mono text-sm">{row.code}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="capitalize">{row.type}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(row.total_debit ?? 0))}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(row.total_credit ?? 0))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string | number | null;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={highlight ? "text-lg font-semibold text-primary" : "text-sm font-medium"}>
        {formatCurrency(Number(value ?? 0))}
      </span>
    </div>
  );
}

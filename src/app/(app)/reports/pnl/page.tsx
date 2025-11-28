import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getProfitAndLoss, getBalanceSheet, getTrialBalance } from "@/lib/data/reports";
import { formatCurrency } from "@/lib/format";

export const revalidate = 120;

export default async function ReportsPage() {
  const [pnl, balanceSheet, trialBalance] = await Promise.all([
    getProfitAndLoss(),
    getBalanceSheet(),
    getTrialBalance(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Financial Reports</h2>
        <p className="text-sm text-muted-foreground">
          Real-time Profit &amp; Loss and Balance Sheet derived from posted journal entries.
        </p>
      </div>
      <Tabs defaultValue="pnl" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
          <TabsTrigger value="trial">Trial Balance</TabsTrigger>
        </TabsList>
        <TabsContent value="pnl">
          <Card>
            <CardHeader>
              <CardTitle>Profit &amp; Loss Summary</CardTitle>
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
            <CardHeader>
              <CardTitle>Balance Sheet</CardTitle>
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
        <TabsContent value="trial">
          <Card>
            <CardHeader>
              <CardTitle>Trial Balance</CardTitle>
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


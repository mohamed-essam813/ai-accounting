/**
 * General Ledger Page
 * Excel Elimination Doctrine: Traceability (≤3 clicks)
 * 
 * Shows all transactions for a specific account
 * Dashboard → Insight → Report → Ledger → Transaction
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { getJournalLedger } from "@/lib/data/reports";
import { listAccounts } from "@/lib/data/accounts";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { ExportButtons } from "@/components/reports/export-buttons";
import { LedgerTableClient } from "@/components/ledger/ledger-table-client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const revalidate = 60;

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ accountCode?: string; startDate?: string; endDate?: string; currency?: string }>;
}) {
  const params = await searchParams;
  const currency = params.currency;
  const [ledger, accounts] = await Promise.all([
    getJournalLedger(params.startDate, params.endDate, currency),
    listAccounts(),
  ]);

  // Filter by account code if provided
  const filteredLedger = params.accountCode
    ? ledger.filter((entry) => entry.account_code === params.accountCode)
    : ledger;

  // Get account name if filtering
  const account = params.accountCode
    ? accounts.find((acc) => acc.code === params.accountCode)
    : null;

  // Calculate running balance
  let runningBalance = 0;
  const ledgerWithBalance = filteredLedger.map((entry, index) => {
    const amount = Number(entry.debit) - Number(entry.credit);
    runningBalance += amount;
    return {
      ...entry,
      amount,
      runningBalance,
      // Create unique key: use line_id if available, otherwise use composite key with index
      uniqueKey: (entry as any).line_id || `${entry.entry_id}-${entry.account_code}-${index}`,
    };
  });

  // Build breadcrumb based on context
  const breadcrumbItems = [
    { label: "Reports", href: "/reports" },
  ];
  
  if (account) {
    breadcrumbItems.push({
      label: account.name,
      href: `/ledger?accountCode=${account.code}`,
    });
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="h-4 w-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbLink href="/reports">Reports</BreadcrumbLink>
          </BreadcrumbItem>
          {account && (
            <>
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>{account.name} ({account.code})</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h2 className="text-2xl font-semibold">General Ledger</h2>
        <p className="text-sm text-muted-foreground">
          {account
            ? `All transactions for ${account.name} (${account.code})`
            : "All journal entries and transactions. Filter by account code to see specific account activity."}
        </p>
      </div>

      <CurrencyFilter initialCurrency={currency} />

      {account && (
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Account Code</p>
                <p className="font-medium">{account.code}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Account Name</p>
                <p className="font-medium">{account.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Account Type</p>
                <p className="font-medium capitalize">{account.type}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>
              {account ? `${account.name} Ledger` : "General Ledger"}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {account
                ? `All transactions for ${account.name} (${account.code})`
                : "All journal entries and transactions. Use filters to adjust date ranges."}
            </p>
          </div>
          {ledgerWithBalance.length > 0 && (
            <ExportButtons
              data={{
                title: account ? `Ledger-${account.code}-${account.name.replace(/\s+/g, "-")}` : "General-Ledger",
                headers: ["Date", "Description", "Account Code", "Account Name", "Debit", "Credit", "Balance", "Memo"],
                rows: ledgerWithBalance.map((entry) => [
                  entry.date,
                  entry.description,
                  entry.account_code,
                  entry.account_name,
                  Number(entry.debit ?? 0),
                  Number(entry.credit ?? 0),
                  entry.runningBalance,
                  entry.memo ?? "",
                ]),
              }}
            />
          )}
        </CardHeader>
        <CardContent>
          <LedgerTableClient entries={ledgerWithBalance} />
        </CardContent>
      </Card>
    </div>
  );
}


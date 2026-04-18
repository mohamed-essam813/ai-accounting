/**
 * General Ledger Page
 * Excel Elimination Doctrine: Traceability (≤3 clicks)
 * 
 * Shows all transactions for a specific account
 * Dashboard → Insight → Report → Ledger → Transaction
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getJournalLedger } from "@/lib/data/reports";
import { listAccounts } from "@/lib/data/accounts";
import { CurrencyFilter } from "@/components/filters/currency-filter";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  LedgerTableClient,
  type LedgerEntryAllAccounts,
  type LedgerEntrySingle,
} from "@/components/ledger/ledger-table-client";
import { SearchableAccountSelector } from "@/components/ledger/searchable-account-selector";
import { convertCurrency, getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import { normaliseCurrencyCode } from "@/lib/currencies";
import { getCurrentUser } from "@/lib/data/users";
import { ChevronRight } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

export const revalidate = 60;

/** Deterministic GL line order for running balance and exports. */
function sortLedgerLines<T extends { date: string; entry_id?: string; line_id?: string }>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) => {
    const dateCmp = String(a.date).localeCompare(String(b.date));
    if (dateCmp !== 0) return dateCmp;
    const eCmp = String(a.entry_id ?? "").localeCompare(String(b.entry_id ?? ""));
    if (eCmp !== 0) return eCmp;
    return String(a.line_id ?? "").localeCompare(String(b.line_id ?? ""));
  });
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ accountCode?: string; startDate?: string; endDate?: string; currency?: string }>;
}) {
  const params = await searchParams;
  const rawCurrency = params.currency;
  const currency =
    rawCurrency && rawCurrency !== "all"
      ? normaliseCurrencyCode(rawCurrency)
      : rawCurrency;
  const targetCurrency = currency && currency !== "all" ? currency : undefined;
  const user = await getCurrentUser();
  const baseCurrency = user?.tenant
    ? await getTenantBaseCurrency(user.tenant.id)
    : "USD";

  const [ledger, accounts] = await Promise.all([
    getJournalLedger(params.startDate, params.endDate, targetCurrency),
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

  const sortedLedger = sortLedgerLines(filteredLedger);

  // Convert amounts if targetCurrency is provided
  const convertedLedger = targetCurrency && user?.tenant
    ? await Promise.all(
        sortedLedger.map(async (entry) => {
          const currencyInfo = (entry as { _currencyInfo?: { baseCurrency?: string; date?: string } })._currencyInfo;
          const baseCurrency = currencyInfo?.baseCurrency || await getTenantBaseCurrency(user.tenant!.id);
          const transactionDate = currencyInfo?.date || entry.date;
          
          const originalDebit = Number(entry.debit ?? 0);
          const originalCredit = Number(entry.credit ?? 0);
          
          // If same currency, no conversion needed
          if (baseCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
            return {
              ...entry,
              debit: originalDebit,
              credit: originalCredit,
            };
          }
          
          // Convert debit and credit amounts
          try {
            const [convertedDebit, convertedCredit] = await Promise.all([
              originalDebit > 0
                ? convertCurrency(originalDebit, baseCurrency, targetCurrency, transactionDate, user.tenant!.id)
                : 0,
              originalCredit > 0
                ? convertCurrency(originalCredit, baseCurrency, targetCurrency, transactionDate, user.tenant!.id)
                : 0,
            ]);
            
            return {
              ...entry,
              debit: convertedDebit,
              credit: convertedCredit,
              _converted: true,
            } as typeof entry & { _converted: boolean };
          } catch (error) {
            console.error(`Failed to convert ledger entry ${entry.entry_id} amounts:`, error);
            return entry;
          }
        }),
      )
    : sortedLedger;

  const orderedLedger = sortLedgerLines(convertedLedger);

  const isSingleAccount = Boolean(params.accountCode);

  // Per-account running balance (debit − credit), date ascending; meaningless across mixed accounts.
  const ledgerWithBalance = isSingleAccount
    ? orderedLedger.reduce(
        (acc, entry, index) => {
          const amount = Number(entry.debit ?? 0) - Number(entry.credit ?? 0);
          const previousBalance = acc.length > 0 ? acc[acc.length - 1].runningBalance : 0;
          const runningBalance = previousBalance + amount;
          acc.push({
            ...entry,
            amount,
            runningBalance,
            uniqueKey:
              (entry as { line_id?: string }).line_id ||
              `${entry.entry_id}-${entry.account_code}-${index}`,
          });
          return acc;
        },
        [] as Array<
          (typeof orderedLedger)[0] & {
            amount: number;
            runningBalance: number;
            uniqueKey: string;
          }
        >,
      )
    : orderedLedger.reduce(
        (acc, entry, index) => {
          const d = Number(entry.debit ?? 0);
          const c = Number(entry.credit ?? 0);
          const prev = acc[acc.length - 1];
          const debitRunningTotal = (prev?.debitRunningTotal ?? 0) + d;
          const creditRunningTotal = (prev?.creditRunningTotal ?? 0) + c;
          acc.push({
            ...entry,
            amount: d - c,
            debitRunningTotal,
            creditRunningTotal,
            uniqueKey:
              (entry as { line_id?: string }).line_id ||
              `${entry.entry_id}-${entry.account_code}-${index}`,
          });
          return acc;
        },
        [] as Array<
          (typeof orderedLedger)[0] & {
            amount: number;
            debitRunningTotal: number;
            creditRunningTotal: number;
            uniqueKey: string;
          }
        >,
      );

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
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
      <div className="header shrink-0 space-y-6">
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

      <div className="filters flex flex-col gap-4 sm:flex-row sm:items-center items-start shrink-0">
        <SearchableAccountSelector accounts={accounts} selectedAccountCode={params.accountCode} />
        <div className="ml-auto">
          <CurrencyFilter initialCurrency={currency} baseCurrency={baseCurrency} currencies={[]} />
        </div>
      </div>

      {!account && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Running balance</AlertTitle>
          <AlertDescription>
            Select a specific account to see a running balance (cumulative debit minus credit for that
            account only). All accounts view shows cumulative debit and credit totals instead.
          </AlertDescription>
        </Alert>
      )}
      </div>

      {account && (
        <Card className="shrink-0">
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

      <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 border-b px-6 py-4">
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
                headers: isSingleAccount
                  ? ["Date", "Description", "Account Code", "Account Name", "Debit", "Credit", "Balance", "Memo"]
                  : [
                      "Date",
                      "Description",
                      "Account Code",
                      "Account Name",
                      "Debit",
                      "Credit",
                      "Debit total (cumulative)",
                      "Credit total (cumulative)",
                      "Memo",
                    ],
                rows: isSingleAccount
                  ? (ledgerWithBalance as Array<{ runningBalance: number } & (typeof ledgerWithBalance)[0]>).map(
                      (entry) => [
                        entry.date,
                        entry.description,
                        entry.account_code,
                        entry.account_name,
                        Number(entry.debit ?? 0),
                        Number(entry.credit ?? 0),
                        entry.runningBalance,
                        entry.memo ?? "",
                      ],
                    )
                  : (
                      ledgerWithBalance as Array<{
                        debitRunningTotal: number;
                        creditRunningTotal: number;
                      } & (typeof ledgerWithBalance)[0]>
                    ).map((entry) => [
                      entry.date,
                      entry.description,
                      entry.account_code,
                      entry.account_name,
                      Number(entry.debit ?? 0),
                      Number(entry.credit ?? 0),
                      entry.debitRunningTotal,
                      entry.creditRunningTotal,
                      entry.memo ?? "",
                    ]),
              }}
            />
          )}
        </CardHeader>
        <CardContent className="ledger-container flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-0 pt-0">
          {isSingleAccount ? (
            <LedgerTableClient
              variant="single-account"
              entries={ledgerWithBalance as LedgerEntrySingle[]}
              displayCurrency={targetCurrency ?? baseCurrency}
            />
          ) : (
            <LedgerTableClient
              variant="all-accounts"
              entries={ledgerWithBalance as LedgerEntryAllAccounts[]}
              displayCurrency={targetCurrency ?? baseCurrency}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}


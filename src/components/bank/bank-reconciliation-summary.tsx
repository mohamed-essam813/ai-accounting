import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import type { BankReconciliationSummaryData } from "@/lib/data/bank-reconciliation-summary";
import { BankStatementBalanceParams } from "./bank-statement-balance-params";

type Props = {
  summary: BankReconciliationSummaryData;
  statementOpening: number | null;
  statementClosing: number | null;
};

function reconciliationStatus(args: {
  unmatchedCount: number;
  difference: number | null;
  currencyCode: string;
}): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  const { unmatchedCount, difference, currencyCode } = args;
  if (unmatchedCount > 0) {
    return {
      label:
        unmatchedCount === 1
          ? "1 transaction still needs review"
          : `${unmatchedCount} transactions still need review`,
      variant: "secondary",
    };
  }
  if (difference !== null && Math.abs(difference) >= 0.01) {
    return {
      label: `Difference remaining: ${formatCurrency(difference, currencyCode)}`,
      variant: "outline",
    };
  }
  if (difference === null) {
    return { label: "All lines categorized — add statement closing to verify", variant: "default" };
  }
  return { label: "Books match statement", variant: "default" };
}

export function BankReconciliationSummary({
  summary,
  statementOpening,
  statementClosing,
}: Props) {
  const currency = summary.currencyCode;
  const difference =
    statementClosing !== null
      ? Math.round((statementClosing - summary.bookBalanceAsOfPeriodEnd) * 100) / 100
      : null;

  const status = reconciliationStatus({
    unmatchedCount: summary.unmatchedCount,
    difference,
    currencyCode: currency,
  });

  const periodLabel =
    summary.periodStart && summary.periodEnd
      ? summary.periodStart === summary.periodEnd
        ? summary.periodStart
        : `${summary.periodStart} → ${summary.periodEnd}`
      : "—";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Reconciliation summary</CardTitle>
            <CardDescription>
              Compare your bank statement to the book balance in RevenuesFlow for the same period.
            </CardDescription>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Statement period (imported lines)</p>
            <p className="font-medium tabular-nums">{periodLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Statement opening balance</p>
            <p className="font-medium tabular-nums">
              {statementOpening !== null
                ? formatCurrency(statementOpening, currency)
                : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Optional — from your PDF/CSV header
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Statement closing balance</p>
            <p className="font-medium tabular-nums">
              {statementClosing !== null
                ? formatCurrency(statementClosing, currency)
                : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Enter below to compute difference vs books
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Book balance in RevenuesFlow</p>
            <p className="font-medium tabular-nums">
              {formatCurrency(summary.bookBalanceAsOfPeriodEnd, currency)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              GL balance as of {summary.periodEnd ?? "—"} (posted journals)
            </p>
          </div>
          {summary.bookBalanceBeforePeriod !== null ? (
            <div>
              <p className="text-xs text-muted-foreground">Book balance (day before period)</p>
              <p className="font-medium tabular-nums">
                {formatCurrency(summary.bookBalanceBeforePeriod, currency)}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-xs text-muted-foreground">Difference</p>
            <p
              className={`font-semibold tabular-nums ${
                difference !== null && Math.abs(difference) >= 0.01
                  ? "text-amber-700 dark:text-amber-400"
                  : difference !== null
                    ? "text-green-700 dark:text-green-400"
                    : ""
              }`}
            >
              {difference !== null
                ? formatCurrency(difference, currency)
                : "Enter statement closing above"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Statement closing − book balance (same statement end date)
            </p>
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground mb-2">Import activity</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4 text-xs">
            <span>Total imported lines: {summary.totalImported}</span>
            <span>Matched: {summary.matchedCount}</span>
            <span>Excluded: {summary.excludedCount}</span>
            <span>Resolved (matched + excluded): {summary.resolvedCount}</span>
            <span>Unmatched: {summary.unmatchedCount}</span>
            <span className="sm:col-span-2">
              Net of imported amounts: {formatCurrency(summary.importedNetAmount, currency)}
            </span>
            <span className="sm:col-span-2 text-amber-800 dark:text-amber-300">
              Still to categorize (net): {formatCurrency(summary.unmatchedNetAmount, currency)}
            </span>
          </div>
        </div>

        <BankStatementBalanceParams />
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  aggregateFixedAssetsTotals,
  listFixedAssetCapitalizationAccountMismatches,
  listFixedAssetsSummary,
  type ListFixedAssetsFilter,
} from "@/lib/data/fixed-assets";
import { listAccounts } from "@/lib/data/accounts";
import { getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import { getCurrentUser } from "@/lib/data/users";
import { listUsefulLifeDefaults } from "@/lib/data/company-settings";
import { FixedAssetsSummary } from "@/components/fixed-assets/fixed-assets-summary";
import { FixedAssetsTable } from "@/components/fixed-assets/fixed-assets-table";
import { RunDepreciationForm } from "@/components/fixed-assets/run-depreciation-form";
import { ManualAssetForm } from "@/components/fixed-assets/manual-asset-form";
import { RegisterFilters } from "@/components/fixed-assets/register-filters";
import type { Account } from "@/lib/accounting";
import { filterFixedAssetCapitalizationAccounts } from "@/lib/fixed-assets/coa-asset-account";

export const dynamic = "force-dynamic";

function parseListFilter(p: Record<string, string | string[] | undefined>): ListFixedAssetsFilter {
  const g = (k: string) => (typeof p[k] === "string" ? p[k] : Array.isArray(p[k]) ? p[k]![0] : undefined);
  return {
    source: (g("source") as ListFixedAssetsFilter["source"]) || "all",
    category: g("category") || undefined,
    location: g("location") || undefined,
    assignee: g("assignee") || undefined,
    purchaseFrom: g("pf") || undefined,
    purchaseTo: g("pt") || undefined,
    age: (g("age") as ListFixedAssetsFilter["age"]) || "all",
  };
}

export default async function FixedAssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const status =
    (typeof params.status === "string" ? params.status : undefined) === "disposed"
      ? "disposed"
      : (typeof params.status === "string" ? params.status : undefined) === "all"
        ? "all"
        : "active";
  const more = parseListFilter(params);

  const user = await getCurrentUser();
  const baseCurrency = user?.tenant ? await getTenantBaseCurrency(user.tenant.id) : "USD";

  const [rows, totals, accounts, capAudit, lifeDefaults] = await Promise.all([
    listFixedAssetsSummary(status, more),
    aggregateFixedAssetsTotals(status, more),
    listAccounts(),
    listFixedAssetCapitalizationAccountMismatches(),
    listUsefulLifeDefaults(),
  ]);

  const assetAccounts = filterFixedAssetCapitalizationAccounts(accounts as Account[]).map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
  }));

  const tabHref = (s: string) => {
    const q = new URLSearchParams();
    if (s !== "active") q.set("status", s);
    for (const [k, v] of Object.entries(params)) {
      if (k === "status") continue;
      if (typeof v === "string" && v) q.set(k, v);
    }
    const qs = q.toString();
    return qs ? `/fixed-assets?${qs}` : "/fixed-assets";
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Fixed Assets</h2>
        <p className="text-sm text-muted-foreground">
          Register, straight-line depreciation, disposals, and links to bill capitalization. Use preview before running monthly
          depreciation.
        </p>
      </div>

      <FixedAssetsSummary
        totalCost={totals.totalCost}
        totalAccumulatedDepreciation={totals.totalAccumulatedDepreciation}
        totalNbv={totals.totalNbv}
        displayCurrency={baseCurrency}
        registerRowCount={totals.rowCount}
        activeAssetCount={totals.activeInRegisterCount}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant={status === "active" ? "default" : "outline"} size="sm" asChild>
          <Link href={tabHref("active")}>Active</Link>
        </Button>
        <Button variant={status === "disposed" ? "default" : "outline"} size="sm" asChild>
          <Link href={tabHref("disposed")}>Disposed</Link>
        </Button>
        <Button variant={status === "all" ? "default" : "outline"} size="sm" asChild>
          <Link href={tabHref("all")}>All</Link>
        </Button>
      </div>

      <RegisterFilters userRole={user?.role ?? null} status={status} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run depreciation</CardTitle>
        </CardHeader>
        <CardContent>
          <RunDepreciationForm displayCurrency={baseCurrency} />
        </CardContent>
      </Card>

      {capAudit.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/40">
          <CardHeader>
            <CardTitle className="text-base">Capitalization account audit</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              These register rows point at a chart account that is not classified as fixed asset (PPE). Review before changing
              accounts or journals — no automatic correction applied.
            </p>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="list-disc space-y-1 pl-5">
              {capAudit.map((r) => (
                <li key={r.assetId}>
                  <Link href={`/fixed-assets/${r.assetId}`} className="font-medium text-primary hover:underline">
                    {r.assetName ?? r.assetId}
                  </Link>
                  {" — "}
                  {r.accountCode != null
                    ? `${r.accountCode} (${r.accountDetailType ?? r.accountType ?? "?"})`
                    : "missing or unknown account"}
                  {r.cost != null ? ` — cost ${r.cost}` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add asset manually</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            When not capitalizing from a bill. Ensure underlying journals are correct for your policy.
          </p>
        </CardHeader>
        <CardContent>
          <ManualAssetForm assetAccounts={assetAccounts} usefulLifeDefaults={lifeDefaults} />
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-medium mb-3">Register</h3>
        <FixedAssetsTable rows={rows} displayCurrency={baseCurrency} />
      </div>
    </div>
  );
}

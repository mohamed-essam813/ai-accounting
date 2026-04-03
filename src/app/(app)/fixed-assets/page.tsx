import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { aggregateFixedAssetsTotals, listFixedAssetsSummary } from "@/lib/data/fixed-assets";
import { listAccounts } from "@/lib/data/accounts";
import { getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import { getCurrentUser } from "@/lib/data/users";
import { FixedAssetsSummary } from "@/components/fixed-assets/fixed-assets-summary";
import { FixedAssetsTable } from "@/components/fixed-assets/fixed-assets-table";
import { RunDepreciationForm } from "@/components/fixed-assets/run-depreciation-form";
import { ManualAssetForm } from "@/components/fixed-assets/manual-asset-form";
import type { Account } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export default async function FixedAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status =
    params.status === "disposed" ? "disposed" : params.status === "all" ? "all" : "active";

  const user = await getCurrentUser();
  const baseCurrency = user?.tenant ? await getTenantBaseCurrency(user.tenant.id) : "USD";

  const [rows, totals, accounts] = await Promise.all([
    listFixedAssetsSummary(status),
    aggregateFixedAssetsTotals(status),
    listAccounts(),
  ]);

  const assetAccounts = (accounts as Account[])
    .filter((a) => a.type === "asset" && a.is_active)
    .map((a) => ({ id: a.id, code: a.code, name: a.name }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const tabHref = (s: string) => (s === "active" ? "/fixed-assets" : `/fixed-assets?status=${s}`);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Fixed Assets</h2>
        <p className="text-sm text-muted-foreground">
          Asset register with straight-line depreciation. Capitalize from supplier bills (&quot;Asset (used over time)&quot;) or add
          manually. Run depreciation monthly to post expense and update NBV.
        </p>
      </div>

      <FixedAssetsSummary
        totalCost={totals.totalCost}
        totalAccumulatedDepreciation={totals.totalAccumulatedDepreciation}
        totalNbv={totals.totalNbv}
        displayCurrency={baseCurrency}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run depreciation</CardTitle>
        </CardHeader>
        <CardContent>
          <RunDepreciationForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add asset manually</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Use when capitalization is not coming from a bill draft. You should still ensure matching journal entries exist if the
            asset was funded earlier.
          </p>
        </CardHeader>
        <CardContent>
          <ManualAssetForm assetAccounts={assetAccounts} />
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-medium mb-3">Register</h3>
        <FixedAssetsTable rows={rows} displayCurrency={baseCurrency} />
      </div>
    </div>
  );
}

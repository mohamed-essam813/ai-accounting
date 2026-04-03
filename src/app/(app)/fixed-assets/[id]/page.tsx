import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { getFixedAssetById, listDepreciationScheduleForAsset } from "@/lib/data/fixed-assets";
import { getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import { getCurrentUser } from "@/lib/data/users";
import { DisposeAssetButton } from "@/components/fixed-assets/dispose-asset-button";

export const dynamic = "force-dynamic";

export default async function FixedAssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const baseCurrency = user?.tenant ? await getTenantBaseCurrency(user.tenant.id) : "USD";

  const [asset, schedule] = await Promise.all([getFixedAssetById(id), listDepreciationScheduleForAsset(id)]);

  if (!asset) notFound();

  const disposed = Boolean(asset.disposed_at);
  const latest = schedule.length > 0 ? schedule[schedule.length - 1] : null;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/fixed-assets" className="hover:underline">
              Fixed Assets
            </Link>
          </p>
          <h2 className="text-2xl font-semibold mt-1">{asset.name}</h2>
          <p className="text-sm text-muted-foreground">{asset.category}</p>
        </div>
        {!disposed && asset.is_active ? (
          <DisposeAssetButton assetId={asset.id} assetName={asset.name} />
        ) : (
          <Badge variant="secondary">Disposed</Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cost</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums">
            {formatCurrency(Number(asset.cost), baseCurrency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Useful life</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{asset.useful_life_months} months</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Accumulated depreciation</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums">
            {formatCurrency(latest ? Number(latest.accumulated_depreciation) : 0, baseCurrency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net book value</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums">
            {formatCurrency(latest ? Number(latest.net_book_value) : Number(asset.cost), baseCurrency)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            <span className="text-muted-foreground">Purchase date:</span> {asset.purchase_date}
          </p>
          <p>
            <span className="text-muted-foreground">Depreciation start:</span> {asset.start_depreciation_date ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Method:</span> {asset.depreciation_method}
          </p>
          {asset.source_journal_entry_id ? (
            <p>
              <span className="text-muted-foreground">Capitalization journal:</span>{" "}
              <span className="font-mono text-xs">{asset.source_journal_entry_id}</span>
            </p>
          ) : null}
          {asset.source_draft_id ? (
            <p>
              <span className="text-muted-foreground">Source draft:</span>{" "}
              <Link href={`/drafts`} className="text-primary hover:underline font-mono text-xs">
                {asset.source_draft_id}
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Depreciation schedule (posted)</CardTitle>
        </CardHeader>
        <CardContent>
          {schedule.length === 0 ? (
            <p className="text-sm text-muted-foreground">No depreciation posted yet. Run depreciation from the Fixed Assets list.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Accumulated</TableHead>
                    <TableHead className="text-right">NBV</TableHead>
                    <TableHead>Journal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.period_start}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(Number(row.depreciation_amount), baseCurrency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(Number(row.accumulated_depreciation), baseCurrency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(Number(row.net_book_value), baseCurrency)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.journal_entry_id ? (
                          <Link href="/journals" className="text-primary hover:underline">
                            {row.journal_entry_id.slice(0, 8)}…
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { getFixedAssetById, listDepreciationScheduleForAsset, listFixedAssetTransfers } from "@/lib/data/fixed-assets";
import { getTenantBaseCurrency } from "@/lib/utils/currency-conversion";
import { getCurrentUser } from "@/lib/data/users";
import { DisposeAssetButton } from "@/components/fixed-assets/dispose-asset-button";
import { TransferAssetButton } from "@/components/fixed-assets/transfer-asset-button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { monthsToDisplayYears } from "@/lib/fixed-assets/useful-life";

export const dynamic = "force-dynamic";

export default async function FixedAssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const baseCurrency = user?.tenant ? await getTenantBaseCurrency(user.tenant.id) : "USD";

  const supabase = await createServerSupabaseClient();
  const [asset, schedule, transfers] = await Promise.all([
    getFixedAssetById(id),
    listDepreciationScheduleForAsset(id),
    listFixedAssetTransfers(id),
  ]);

  if (!asset) notFound();

  const { data: billRow } =
    user?.tenant && asset.source_bill_id
      ? await supabase
          .from("bills")
          .select("id, bill_number, bill_date, journal_entry_id")
          .eq("id", asset.source_bill_id)
          .eq("tenant_id", user.tenant.id)
          .maybeSingle()
      : { data: null as { id: string; bill_number: string | null; bill_date: string } | null };

  const disposed = Boolean(asset.disposed_at);
  const latest = schedule.length > 0 ? schedule[schedule.length - 1] : null;
  const useYears = monthsToDisplayYears(asset.useful_life_months);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/fixed-assets" className="hover:underline">
              Fixed Assets
            </Link>
          </p>
          <h2 className="text-2xl font-semibold mt-1">
            {asset.name}
            {asset.asset_code ? <span className="text-base font-mono text-muted-foreground"> — {asset.asset_code}</span> : null}
          </h2>
          <p className="text-sm text-muted-foreground">{asset.category}</p>
        </div>
        {disposed ? (
          <Badge variant="secondary">Disposed</Badge>
        ) : asset.is_active ? (
          <div className="flex flex-wrap gap-1">
            <TransferAssetButton
              assetId={asset.id}
              currentLocation={asset.location}
              currentAssignee={asset.assigned_to}
            />
            <DisposeAssetButton assetId={asset.id} assetName={asset.name} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cost</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold tabular-nums">{formatCurrency(Number(asset.cost), baseCurrency)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Useful life</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {useYears.toFixed(1)} years <span className="text-sm font-normal text-muted-foreground">({asset.useful_life_months} mo in ledger)</span>
          </CardContent>
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

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="depreciation">Depreciation schedule</TabsTrigger>
          <TabsTrigger value="tx">Transactions</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
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
              <p>
                <span className="text-muted-foreground">Source:</span> {asset.source_type ?? "manual"}
              </p>
              {billRow ? (
                <p>
                  <span className="text-muted-foreground">Vendor bill:</span>{" "}
                  <Link className="text-primary hover:underline font-mono" href={`/bills/${billRow.id}`}>
                    {String(billRow.bill_number ?? billRow.id).slice(0, 32)}
                  </Link>
                </p>
              ) : null}
              {asset.source_journal_entry_id ? (
                <p>
                  <span className="text-muted-foreground">Capitalization journal:</span>{" "}
                  <Link
                    href={`/journals?entryId=${encodeURIComponent(asset.source_journal_entry_id)}`}
                    className="text-primary hover:underline"
                  >
                    Open in journals
                  </Link>
                </p>
              ) : null}
              {asset.source_draft_id ? (
                <p>
                  <span className="text-muted-foreground">Source draft:</span>{" "}
                  <Link className="font-mono text-primary hover:underline" href="/drafts">
                    {asset.source_draft_id}
                  </Link>
                </p>
              ) : null}
              {asset.disposed_at ? (
                <div className="pt-2 space-y-1">
                  <p>
                    <span className="text-muted-foreground">Disposal date:</span> {asset.disposed_at}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Method / gain(loss):</span>{" "}
                    {(asset as { disposal_method?: string | null }).disposal_method ?? "—"} /{" "}
                    {formatCurrency(Number(asset.disposal_gain_loss ?? 0), baseCurrency)}
                  </p>
                  {asset.disposal_journal_entry_id ? (
                    <p>
                      <span className="text-muted-foreground">Disposal entry:</span>{" "}
                      <Link
                        className="text-primary hover:underline"
                        href={`/journals?entryId=${encodeURIComponent(asset.disposal_journal_entry_id)}`}
                      >
                        Journals
                      </Link>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="depreciation" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Depreciation schedule (posted)</CardTitle>
            </CardHeader>
            <CardContent>
              {schedule.length === 0 ? (
                <p className="text-sm text-muted-foreground">No depreciation posted yet.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
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
                          <TableCell>
                            {row.journal_entry_id ? (
                              <Link
                                href={`/journals?entryId=${encodeURIComponent(row.journal_entry_id)}`}
                                className="text-primary text-xs font-mono hover:underline"
                              >
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
        </TabsContent>
        <TabsContent value="tx" className="pt-4 text-sm text-muted-foreground">
          <ul className="list-disc pl-5 space-y-1">
            {asset.source_journal_entry_id ? (
              <li>
                <Link
                  className="text-primary hover:underline"
                  href={`/journals?entryId=${encodeURIComponent(asset.source_journal_entry_id)}`}
                >
                  Capitalization journal
                </Link>
              </li>
            ) : null}
            {schedule.map((row) => (
              <li key={row.id}>
                {row.journal_entry_id ? (
                  <Link
                    className="text-primary hover:underline"
                    href={`/journals?entryId=${encodeURIComponent(row.journal_entry_id!)}`}
                  >
                    Depreciation {row.period_start}
                  </Link>
                ) : null}
              </li>
            ))}
            {asset.disposal_journal_entry_id ? (
              <li>
                <Link
                  className="text-primary hover:underline"
                  href={`/journals?entryId=${encodeURIComponent(asset.disposal_journal_entry_id)}`}
                >
                  Disposal journal
                </Link>
              </li>
            ) : null}
            {!asset.source_journal_entry_id && !schedule.length && !asset.disposal_journal_entry_id ? (
              <li>None yet.</li>
            ) : null}
          </ul>
        </TabsContent>
        <TabsContent value="transfers" className="pt-4">
          {transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transfer history yet.</p>
          ) : (
            <ul className="text-sm space-y-3">
              {transfers.map((t) => (
                <li key={t.id} className="border rounded p-2">
                  <p className="font-medium">{t.transfer_date}</p>
                  {t.to_location != null && (
                    <p>Location: {t.from_location ?? "—"} → {t.to_location || "—"}</p>
                  )}
                  {t.to_assigned_to != null && (
                    <p>Assignee: {t.from_assigned_to ?? "—"} → {t.to_assigned_to || "—"}</p>
                  )}
                  {t.reason ? <p>Reason: {t.reason}</p> : null}
                  {t.notes ? <p>Notes: {t.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="documents" className="pt-4 text-sm text-muted-foreground">
          <p>Attach bill PDF, photos, and warranty documents in future releases (Prompt 9 / documents module).</p>
        </TabsContent>
        <TabsContent value="audit" className="pt-4 text-sm text-muted-foreground">
          <p>
            The general audit log is in{" "}
            <Link className="text-primary hover:underline" href="/settings">
              company settings
            </Link>{" "}
            / security — per-entity audit is planned in RBAC / audit workstreams.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

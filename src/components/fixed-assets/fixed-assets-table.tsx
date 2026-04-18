"use client";

import Link from "next/link";
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
import type { FixedAssetSummaryRow } from "@/lib/data/fixed-assets";
import { DisposeAssetButton } from "@/components/fixed-assets/dispose-asset-button";
import { TransferAssetButton } from "@/components/fixed-assets/transfer-asset-button";
import { Button } from "@/components/ui/button";

type Props = {
  rows: FixedAssetSummaryRow[];
  displayCurrency: string;
};

const sourceLabel = (s: string | null | undefined) => {
  if (s === "vendor_bill") return "Bill";
  if (s === "opening_balance") return "OB";
  if (s === "manual") return "Manual";
  return s ?? "—";
};

export function FixedAssetsTable({ rows, displayCurrency }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center border rounded-md">
        No fixed assets match. Adjust filters or post a bill with an asset line.
      </p>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Accum. depr.</TableHead>
            <TableHead className="text-right">NBV</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right w-[200px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const id = r.asset_id ?? "";
            const disposed = Boolean(r.disposed_at);
            const canAct = !disposed && r.is_active;
            return (
              <TableRow key={id}>
                <TableCell className="font-medium min-w-[140px]">
                  <Link href={`/fixed-assets/${id}`} className="hover:underline text-primary">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                  {sourceLabel(r.source_type ?? null)}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.category}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(Number(r.cost ?? 0), displayCurrency)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Number(r.accumulated_depreciation ?? 0), displayCurrency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Number(r.net_book_value ?? 0), displayCurrency)}
                </TableCell>
                <TableCell>
                  {disposed ? (
                    <Badge variant="secondary">Disposed</Badge>
                  ) : r.is_active ? (
                    <Badge variant="default">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/fixed-assets/${id}`}>View</Link>
                    </Button>
                    {canAct ? (
                      <>
                        <TransferAssetButton
                          assetId={id}
                          currentLocation={r.location ?? null}
                          currentAssignee={r.assigned_to ?? null}
                        />
                        <DisposeAssetButton assetId={id} assetName={r.name ?? "Asset"} />
                      </>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

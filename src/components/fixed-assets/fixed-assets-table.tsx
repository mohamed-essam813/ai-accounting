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

type Props = {
  rows: FixedAssetSummaryRow[];
  displayCurrency: string;
};

export function FixedAssetsTable({ rows, displayCurrency }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center border rounded-md">
        No fixed assets yet. Post a supplier bill with &quot;Asset (used over time)&quot; or add one manually.
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Accum. depr.</TableHead>
            <TableHead className="text-right">NBV</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const id = r.asset_id ?? "";
            const disposed = Boolean(r.disposed_at);
            return (
              <TableRow key={id}>
                <TableCell className="font-medium">
                  <Link href={`/fixed-assets/${id}`} className="hover:underline text-primary">
                    {r.name}
                  </Link>
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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

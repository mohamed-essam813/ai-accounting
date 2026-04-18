"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { previewDepreciationAction, runMonthlyDepreciationAction } from "@/lib/actions/fixed-assets";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";

function firstDayOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function RunDepreciationForm({ displayCurrency }: { displayCurrency: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [period, setPeriod] = useState(() => firstDayOfMonth(new Date()));

  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewDepreciationAction>> | null>(null);

  const runPreview = async () => {
    setPending(true);
    try {
      const p = await previewDepreciationAction({ periodStart: period });
      setPreview(p);
      setPreviewOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPending(false);
    }
  };

  const runDepreciation = async () => {
    setPending(true);
    try {
      const { message, entriesPosted } = await runMonthlyDepreciationAction({ periodStart: period });
      if (message) {
        if (entriesPosted === 0) {
          toast.message(message);
        } else {
          toast.success(message);
        }
      } else {
        toast.success("Depreciation run complete.");
      }
      setPreviewOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Depreciation failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="dep-period">Period (month)</Label>
          <Input
            id="dep-period"
            type="month"
            className="w-[200px]"
            value={period.slice(0, 7)}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              setPeriod(`${v}-01`);
            }}
          />
          <p className="text-xs text-muted-foreground">Per-asset: Dr 5600 / Cr 1600, memo includes asset name and YYYY-MM.</p>
        </div>
        <Button type="button" variant="secondary" disabled={pending} onClick={runPreview}>
          {pending ? "…" : "Preview"}
        </Button>
        <Button type="button" variant="default" disabled={pending} onClick={() => void runDepreciation()}>
          {pending ? "Running…" : "Run (skip preview)"}
        </Button>
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Depreciation preview</DialogTitle>
            <DialogDescription>
              {preview?.message ? preview.message : `Period ${period.slice(0, 7)} — new depreciation for this run.`}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Assets to depreciate (this run):</span>{" "}
                <span className="font-medium tabular-nums">{preview.lineCount}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Total depreciation for period:</span>{" "}
                <span className="font-semibold tabular-nums">
                  {formatCurrency(preview.totalDepreciation, preview.baseCurrency || displayCurrency)}
                </span>
              </p>
              <div className="rounded-md border overflow-x-auto max-h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Mos elapsed</TableHead>
                      <TableHead className="text-right">Base / mo</TableHead>
                      <TableHead className="text-right">This period</TableHead>
                      <TableHead className="text-right">Acc. after</TableHead>
                      <TableHead className="text-right">NBV after</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.lines.map((line) => (
                      <TableRow key={line.assetId}>
                        <TableCell className="max-w-[180px] truncate">{line.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(line.cost, preview.baseCurrency || displayCurrency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{line.monthsElapsed}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(line.monthlyDeprecBase, preview.baseCurrency || displayCurrency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(line.thisPeriod, preview.baseCurrency || displayCurrency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(line.accumAfter, preview.baseCurrency || displayCurrency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(line.nbvAfter, preview.baseCurrency || displayCurrency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runDepreciation} disabled={pending || !preview || (preview?.lineCount ?? 0) === 0}>
              {pending ? "Posting…" : "Confirm and post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PlLineSection } from "@/lib/accounting/account-classification";
import { deltaTone } from "@/lib/reports/variance-pnl";
import type { PnlRowVariance } from "@/lib/reports/variance-pnl";
import type { PlAccountLine, PlTotals } from "@/lib/reports/pnl-compute";
import { cn } from "@/lib/utils";

export type UnifiedPnlPayload = {
  lines: PlAccountLine[];
  currentTotals: PlTotals;
  priorTotals: PlTotals;
  subcategoryGroups: { key: string; order: string[] }[];
  compareLabel: { current: string; prior: string };
  comparisonActive: boolean;
  grossMarginPpChange: number | null;
  netMarginPpChange: number | null;
};

const sectionLabel: Record<PlLineSection, string> = {
  revenue: "Revenue",
  cost_of_sales: "Cost of Sales",
  operating_expenses: "Operating Expenses",
  other_income: "Other Income",
  gain_loss: "Other expenses / (gain) on disposal",
};

/** For profit / margin subtotals, “higher is better” — treat like revenue. */
const PROFIT_LIKE: PlLineSection = "revenue";

function varBadge(v: PnlRowVariance, cmp: boolean) {
  if (!cmp) return null;
  if (v === "new") return <Badge className="h-5 min-w-0 text-[10px] bg-emerald-600/90">NEW</Badge>;
  if (v === "dropped")
    return <Badge variant="secondary" className="h-5 min-w-0 text-[10px] text-muted-foreground">DROPPED</Badge>;
  if (v === "material")
    return (
      <Badge variant="outline" className="h-5 min-w-0 text-[10px]">
        M
      </Badge>
    );
  return <span className="inline-block w-6" aria-hidden />;
}

type Props = {
  data: UnifiedPnlPayload;
  displayCurrency: string;
};

function toneClass(s: PlLineSection, change: number) {
  const t = deltaTone(s, change);
  if (t === "favorable") return "text-emerald-600";
  if (t === "unfavorable") return "text-destructive";
  return "text-muted-foreground";
}

function RowAmounts(l: PlAccountLine, ccy: string, cmp: boolean) {
  if (!cmp) {
    return <TableCell className="text-right font-medium tabular-nums">{formatCurrency(l.current, ccy)}</TableCell>;
  }
  return (
    <>
      <TableCell className="text-right font-medium tabular-nums">{formatCurrency(l.current, ccy)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(l.prior, ccy)}</TableCell>
      <TableCell className={cn("text-right font-medium tabular-nums", toneClass(l.section, l.changeAbs))}>
        {l.changeAbs === 0
          ? "—"
          : l.changeAbs > 0
            ? `+${formatCurrency(l.changeAbs, ccy)}`
            : `(${formatCurrency(-l.changeAbs, ccy)})`}
      </TableCell>
      <TableCell className={cn("text-right text-sm tabular-nums", toneClass(l.section, l.changeAbs))}>
        {l.changePct == null || l.changeAbs === 0
          ? "—"
          : `${l.changeAbs > 0 ? "" : "−"}${Math.abs(l.changePct).toFixed(1)}%`}
      </TableCell>
    </>
  );
}

function SubtotalRow(p: {
  label: string;
  cur: number;
  pr: number;
  section: PlLineSection;
  ccy: string;
  cmp: boolean;
  colSpan: number;
}) {
  const ch = p.cur - p.pr;
  const chPct = p.cmp ? (p.pr !== 0 ? (ch / p.pr) * 100 : p.cur !== 0 ? 100 : null) : null;
  return (
    <TableRow className="bg-muted/40 font-semibold">
      <TableCell colSpan={p.colSpan} className="text-muted-foreground text-sm">
        {p.label}
      </TableCell>
      {p.cmp ? (
        <>
          <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(p.cur, p.ccy)}</TableCell>
          <TableCell className="text-right font-semibold tabular-nums text-muted-foreground">
            {formatCurrency(p.pr, p.ccy)}
          </TableCell>
          <TableCell className={cn("text-right font-semibold tabular-nums", p.cmp && toneClass(p.section, ch))}>
            {ch === 0
              ? "—"
              : ch > 0
                ? `+${formatCurrency(ch, p.ccy)}`
                : `(${formatCurrency(-ch, p.ccy)})`}
          </TableCell>
          <TableCell className={cn("text-right font-semibold text-sm", p.cmp && toneClass(p.section, ch))}>
            {p.cmp && chPct != null && ch !== 0 ? `${ch > 0 ? "" : "−"}${Math.abs(chPct).toFixed(1)}%` : "—"}
          </TableCell>
        </>
      ) : (
        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(p.cur, p.ccy)}</TableCell>
      )}
    </TableRow>
  );
}

function ProfitLine(p: { label: string; cur: number; pr: number; ccy: string; cmp: boolean; colSpan: number }) {
  const ch = p.cur - p.pr;
  const chPct = p.cmp && p.pr !== 0 ? (ch / p.pr) * 100 : p.cmp && p.pr === 0 && p.cur !== 0 ? 100 : null;
  return (
    <TableRow className="bg-primary/5 font-semibold">
      <TableCell colSpan={p.colSpan} className="text-foreground text-sm">
        {p.label}
      </TableCell>
      {p.cmp ? (
        <>
          <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(p.cur, p.ccy)}</TableCell>
          <TableCell className="text-right font-semibold tabular-nums text-muted-foreground">
            {formatCurrency(p.pr, p.ccy)}
          </TableCell>
          <TableCell className={cn("text-right font-semibold tabular-nums", toneClass(PROFIT_LIKE, ch))}>
            {ch === 0
              ? "—"
              : ch > 0
                ? `+${formatCurrency(ch, p.ccy)}`
                : `(${formatCurrency(-ch, p.ccy)})`}
          </TableCell>
          <TableCell className={cn("text-right font-semibold text-sm", toneClass(PROFIT_LIKE, ch))}>
            {ch !== 0 && chPct != null ? `${ch > 0 ? "" : "−"}${Math.abs(chPct).toFixed(1)}%` : "—"}
          </TableCell>
        </>
      ) : (
        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(p.cur, p.ccy)}</TableCell>
      )}
    </TableRow>
  );
}

function MarginLine(p: {
  label: string;
  cur: number | null;
  pr: number | null;
  ppCh: number | null;
  cmp: boolean;
  colSpan: number;
}) {
  return (
    <TableRow className="text-sm text-muted-foreground">
      <TableCell colSpan={p.colSpan}>{p.label}</TableCell>
      {p.cmp ? (
        <>
          <TableCell className="text-right tabular-nums">
            {p.cur == null ? "—" : `${p.cur.toFixed(1)}%`}
          </TableCell>
          <TableCell className="text-right tabular-nums">{p.pr == null ? "—" : `${p.pr.toFixed(1)}%`}</TableCell>
          <TableCell className="text-right tabular-nums">—</TableCell>
          <TableCell className="text-right tabular-nums text-foreground/80">
            {p.ppCh == null ? "—" : `${p.ppCh > 0 ? "+" : ""}${p.ppCh.toFixed(1)}pp`}
          </TableCell>
        </>
      ) : (
        <TableCell className="text-right tabular-nums">{p.cur == null ? "—" : `${p.cur.toFixed(1)}%`}</TableCell>
      )}
    </TableRow>
  );
}

export function UnifiedPnlBody({ data, displayCurrency: ccy }: Props) {
  const [q, setQ] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({
    rev: true,
    cos: true,
    opex: true,
    oi: true,
    gl: true,
  });
  const setAll = (v: boolean) => {
    setOpen({ rev: v, cos: v, opex: v, oi: v, gl: v });
  };
  const cmp = data.comparisonActive;
  const colSpan = cmp ? 3 : 2;
  const headCols = cmp ? 7 : 3;
  const opexOrder = data.subcategoryGroups.find((g) => g.key === "opex")?.order ?? [];

  const lineOk = useCallback(
    (l: PlAccountLine) => {
      if (q.trim()) {
        const t = q.trim().toLowerCase();
        if (!l.name.toLowerCase().includes(t) && !l.code.toLowerCase().includes(t)) return false;
      }
      if (onlyChanged && (l.variance === "unchanged" || l.variance === "excluded")) return false;
      return true;
    },
    [q, onlyChanged],
  );

  const bySec = useMemo(() => {
    const m: Record<PlLineSection, PlAccountLine[]> = {
      revenue: [],
      cost_of_sales: [],
      operating_expenses: [],
      other_income: [],
      gain_loss: [],
    };
    for (const l of data.lines) {
      if (!lineOk(l)) continue;
      m[l.section].push(l);
    }
    return m;
  }, [data.lines, lineOk]);

  const opexGrouped = useMemo(() => {
    const unc: PlAccountLine[] = [];
    const withSub = new Map<string, PlAccountLine[]>();
    for (const s of opexOrder) {
      withSub.set(s, []);
    }
    for (const l of bySec.operating_expenses) {
      if (!l.plSubcategory) {
        unc.push(l);
        continue;
      }
      if (!withSub.has(l.plSubcategory)) withSub.set(l.plSubcategory, []);
      withSub.get(l.plSubcategory)!.push(l);
    }
    return { unc, withSub };
  }, [bySec.operating_expenses, opexOrder]);

  const tCur = data.currentTotals;
  const tPr = data.priorTotals;

  const head = () =>
    cmp ? (
      <TableRow>
        <TableHead className="w-6" />
        <TableHead className="w-20">Code</TableHead>
        <TableHead>Account</TableHead>
        <TableHead className="text-right">Current</TableHead>
        <TableHead className="text-right">Comparison</TableHead>
        <TableHead className="text-right">Change</TableHead>
        <TableHead className="text-right w-20">Change %</TableHead>
      </TableRow>
    ) : (
      <TableRow>
        <TableHead className="w-20">Code</TableHead>
        <TableHead>Account</TableHead>
        <TableHead className="text-right">Amount</TableHead>
      </TableRow>
    );

  const sectionHead = (key: keyof typeof open, title: string) => (
    <TableRow
      className="cursor-pointer bg-muted/20 hover:bg-muted/30"
      onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
    >
      <TableCell colSpan={headCols} className="font-semibold text-sm">
        {open[key] ? <ChevronDown className="inline h-4 w-4 mr-1" /> : <ChevronRight className="inline h-4 w-4 mr-1" />}
        {title}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-muted-foreground text-sm sr-only" htmlFor="rptq">
          Search
        </Label>
        <Input
          id="rptq"
          placeholder="Search account…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs h-8"
        />
        <div className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            id="onlych"
            checked={onlyChanged}
            onChange={(e) => setOnlyChanged(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <label htmlFor="onlych" className="text-muted-foreground">
            Show only changed rows
          </label>
        </div>
        <div className="flex gap-1 ml-auto">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAll(true)}>
            Expand all
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAll(false)}>
            Collapse all
          </Button>
        </div>
      </div>
      {cmp && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Current</span> {data.compareLabel.current} ·
          <span className="font-medium ml-2">Comparison</span> {data.compareLabel.prior}
        </p>
      )}
      <div className="border rounded-md overflow-x-auto max-h-[70vh] overflow-y-auto">
        <Table>
          <TableHeader>{head()}</TableHeader>
          <TableBody>
            {sectionHead("rev", sectionLabel.revenue)}
            {open.rev &&
              bySec.revenue.map((l) => (
                <TableRow key={l.id}>
                  {cmp && <TableCell className="w-6 p-1">{varBadge(l.variance, cmp)}</TableCell>}
                  <TableCell className="font-mono text-xs text-muted-foreground w-20 p-1">{l.code}</TableCell>
                  <TableCell className="text-sm p-1.5">{l.name}</TableCell>
                  {RowAmounts(l, ccy, cmp)}
                </TableRow>
              ))}
            <SubtotalRow
              colSpan={colSpan}
              label="Total revenue"
              cur={tCur.totalRevenue}
              pr={tPr.totalRevenue}
              section="revenue"
              ccy={ccy}
              cmp={cmp}
            />

            {sectionHead("cos", sectionLabel.cost_of_sales)}
            {open.cos &&
              bySec.cost_of_sales.map((l) => (
                <TableRow key={l.id}>
                  {cmp && <TableCell className="w-6 p-1">{varBadge(l.variance, cmp)}</TableCell>}
                  <TableCell className="font-mono text-xs text-muted-foreground w-20 p-1">{l.code}</TableCell>
                  <TableCell className="text-sm p-1.5">{l.name}</TableCell>
                  {RowAmounts(l, ccy, cmp)}
                </TableRow>
              ))}
            <SubtotalRow
              colSpan={colSpan}
              label="Total cost of sales"
              cur={tCur.totalCostOfSales}
              pr={tPr.totalCostOfSales}
              section="cost_of_sales"
              ccy={ccy}
              cmp={cmp}
            />

            <ProfitLine
              colSpan={colSpan}
              label="Gross profit"
              cur={tCur.grossProfit}
              pr={tPr.grossProfit}
              ccy={ccy}
              cmp={cmp}
            />
            <MarginLine
              colSpan={colSpan}
              label="Gross margin %"
              cur={tCur.grossMarginPercent}
              pr={tPr.grossMarginPercent}
              ppCh={data.grossMarginPpChange}
              cmp={cmp}
            />

            {sectionHead("opex", sectionLabel.operating_expenses)}
            {open.opex && (
              <>
                {opexOrder.map((sub) => {
                  const rows = opexGrouped.withSub.get(sub) ?? [];
                  if (rows.length === 0) return null;
                  return (
                    <Fragment key={sub}>
                      <TableRow className="bg-muted/10">
                        <TableCell colSpan={headCols} className="text-xs font-medium text-muted-foreground">
                          {sub}
                        </TableCell>
                      </TableRow>
                      {rows.map((l) => (
                        <TableRow key={l.id}>
                          {cmp && <TableCell className="w-6 p-1">{varBadge(l.variance, cmp)}</TableCell>}
                          <TableCell className="font-mono text-xs text-muted-foreground w-20 p-1">{l.code}</TableCell>
                          <TableCell className="text-sm p-1.5 pl-4">{l.name}</TableCell>
                          {RowAmounts(l, ccy, cmp)}
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
                {opexGrouped.unc.map((l) => (
                  <TableRow key={l.id}>
                    {cmp && <TableCell className="w-6 p-1">{varBadge(l.variance, cmp)}</TableCell>}
                    <TableCell className="font-mono text-xs text-muted-foreground w-20 p-1">{l.code}</TableCell>
                    <TableCell className="text-sm p-1.5">{l.name}</TableCell>
                    {RowAmounts(l, ccy, cmp)}
                  </TableRow>
                ))}
              </>
            )}
            <SubtotalRow
              colSpan={colSpan}
              label="Total operating expenses"
              cur={tCur.totalOperatingExpenses}
              pr={tPr.totalOperatingExpenses}
              section="operating_expenses"
              ccy={ccy}
              cmp={cmp}
            />
            <ProfitLine
              colSpan={colSpan}
              label="Operating profit"
              cur={tCur.operatingProfit}
              pr={tPr.operatingProfit}
              ccy={ccy}
              cmp={cmp}
            />

            {sectionHead("oi", sectionLabel.other_income)}
            {open.oi &&
              bySec.other_income.map((l) => (
                <TableRow key={l.id}>
                  {cmp && <TableCell className="w-6 p-1">{varBadge(l.variance, cmp)}</TableCell>}
                  <TableCell className="font-mono text-xs text-muted-foreground w-20 p-1">{l.code}</TableCell>
                  <TableCell className="text-sm p-1.5">{l.name}</TableCell>
                  {RowAmounts(l, ccy, cmp)}
                </TableRow>
              ))}
            <SubtotalRow
              colSpan={colSpan}
              label="Total other income"
              cur={tCur.totalOtherIncome}
              pr={tPr.totalOtherIncome}
              section="other_income"
              ccy={ccy}
              cmp={cmp}
            />

            {sectionHead("gl", sectionLabel.gain_loss)}
            {open.gl &&
              bySec.gain_loss.map((l) => (
                <TableRow key={l.id}>
                  {cmp && <TableCell className="w-6 p-1">{varBadge(l.variance, cmp)}</TableCell>}
                  <TableCell className="font-mono text-xs text-muted-foreground w-20 p-1">{l.code}</TableCell>
                  <TableCell className="text-sm p-1.5">{l.name}</TableCell>
                  {RowAmounts(l, ccy, cmp)}
                </TableRow>
              ))}
            <SubtotalRow
              colSpan={colSpan}
              label="Total other expenses / (gain) on disposal"
              cur={tCur.totalGainLoss}
              pr={tPr.totalGainLoss}
              section="gain_loss"
              ccy={ccy}
              cmp={cmp}
            />

            <ProfitLine
              colSpan={colSpan}
              label="Net profit"
              cur={tCur.netProfit}
              pr={tPr.netProfit}
              ccy={ccy}
              cmp={cmp}
            />
            <MarginLine
              colSpan={colSpan}
              label="Net margin %"
              cur={tCur.netMarginPercent}
              pr={tPr.netMarginPercent}
              ppCh={data.netMarginPpChange}
              cmp={cmp}
            />
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UnifiedPnlBody, type UnifiedPnlPayload } from "@/components/reports/unified-pnl-body";
import { isReportApiSlug, REPORT_API_SLUGS, type ReportApiSlug } from "@/lib/reports/report-api-types";
import { Alert, AlertDescription } from "@/components/ui/alert";

const REPORT_CHOICES: { slug: ReportApiSlug; label: string }[] = [
  { slug: "pnl", label: "Profit & Loss Statement" },
  { slug: "balance_sheet", label: "Balance Sheet" },
  { slug: "cash_flow", label: "Cash Flow Statement" },
  { slug: "trial_balance", label: "Trial Balance" },
  { slug: "vat", label: "VAT Report (UAE VAT 201)" },
  { slug: "ar_aging", label: "Accounts Receivable Aging" },
  { slug: "ap_aging", label: "Accounts Payable Aging" },
];

type Comp = "none" | "prior_period" | "prior_year" | "custom";

function readParams(sp: URLSearchParams) {
  const r = sp.get("report") ?? "";
  const report: ReportApiSlug = isReportApiSlug(r) ? r : "pnl";
  const startDate = sp.get("startDate") ?? "";
  const endDate = sp.get("endDate") ?? "";
  const c = (sp.get("comparison") as Comp) || "prior_period";
  const comparison: Comp = ["none", "prior_period", "prior_year", "custom"].includes(c) ? c : "prior_period";
  return {
    report,
    startDate,
    endDate,
    comparison,
    compareStart: sp.get("compareStart") ?? "",
    compareEnd: sp.get("compareEnd") ?? "",
  };
}

type Props = {
  baseCurrency: string;
  companyName: string;
};

export function ReportsUnifiedShell({ baseCurrency, companyName }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const p = readParams(sp);
  const [pnl, setPnl] = useState<UnifiedPnlPayload | null>(null);
  const [load, setLoad] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastReport = useRef<string | null>(null);

  const pushQ = useCallback(
    (mut: (q: URLSearchParams) => void) => {
      const q = new URLSearchParams(sp.toString());
      mut(q);
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  useEffect(() => {
    if (lastReport.current != null && lastReport.current !== p.report) {
      bodyRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }
    lastReport.current = p.report;
  }, [p.report]);

  useEffect(() => {
    if (p.report !== "pnl" || !p.startDate || !p.endDate) {
      setPnl(null);
      return;
    }
    let c = true;
    setLoad(true);
    setErr(null);
    const body: Record<string, unknown> = {
      startDate: p.startDate,
      endDate: p.endDate,
      comparison: p.comparison,
      filters: {},
    };
    if (p.comparison === "custom" && p.compareStart && p.compareEnd) {
      body.compareStart = p.compareStart;
      body.compareEnd = p.compareEnd;
    }
    (async () => {
      const res = await fetch("/api/reports/pnl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { data?: UnifiedPnlPayload; error?: string };
      if (!c) return;
      setLoad(false);
      if (!res.ok) {
        setPnl(null);
        setErr(j.error ?? "Could not load report");
        return;
      }
      if (j.data) setPnl(j.data);
    })();
    return () => {
      c = false;
    };
  }, [p.report, p.startDate, p.endDate, p.comparison, p.compareStart, p.compareEnd]);

  const compLabel =
    p.comparison === "none"
      ? "no comparison"
      : p.comparison === "prior_year"
        ? "vs prior year same period"
        : p.comparison === "custom"
          ? p.compareStart && p.compareEnd
            ? `vs custom (${p.compareStart} – ${p.compareEnd})`
            : "vs custom (set compare dates in URL)"
          : "vs prior period (same length)";

  const subline = p.startDate
    ? [formatDate(p.startDate), p.endDate ? "–" : null, p.endDate ? formatDate(p.endDate) : null, compLabel]
        .filter(Boolean)
        .join(" ")
    : "Pick a period";

  let main: ReactNode;
  if (p.report === "pnl") {
    if (load) {
      main = (
        <div className="space-y-2" aria-live="polite" aria-busy>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    } else if (err) {
      main = (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      );
    } else if (pnl) {
      main = <UnifiedPnlBody data={pnl} displayCurrency={baseCurrency} />;
    } else {
      main = <p className="text-sm text-muted-foreground">Set a valid period to load the P&amp;L.</p>;
    }
  } else {
    main = (
      <p className="text-sm text-muted-foreground">
        This report is being rebuilt in the unified shell. Choose <strong>Profit &amp; Loss</strong> for the new
        experience, or use prior routes until the remaining reports are connected.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Financial statements, VAT, and aging in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8" disabled>
            CSV
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8" disabled>
            Excel
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8" disabled>
            PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="grid flex-1 gap-2 min-w-0 sm:min-w-[220px]">
              <Label className="text-xs">Report</Label>
              <Select
                value={p.report}
                onValueChange={(v) => {
                  if (!REPORT_API_SLUGS.includes(v as ReportApiSlug)) return;
                  pushQ((q) => q.set("report", v));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_CHOICES.map((o) => (
                    <SelectItem key={o.slug} value={o.slug}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={p.startDate}
                  onChange={(e) => pushQ((q) => q.set("startDate", e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={p.endDate}
                  onChange={(e) => pushQ((q) => q.set("endDate", e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1.5 w-full min-w-0 sm:min-w-[200px] max-w-sm">
              <Label className="text-xs">Comparison</Label>
              <Select
                value={p.comparison}
                onValueChange={(v) => {
                  if (!v) return;
                  pushQ((q) => {
                    q.set("comparison", v);
                    if (v !== "custom") {
                      q.delete("compareStart");
                      q.delete("compareEnd");
                    }
                  });
                }}
                disabled={p.report !== "pnl" && p.report !== "vat" && p.report !== "cash_flow"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="prior_period">Prior period (same length)</SelectItem>
                  <SelectItem value="prior_year">Prior year, same period</SelectItem>
                  <SelectItem value="custom" disabled>
                    Custom range (set via URL: compareStart, compareEnd)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {companyName} · {subline || "Pick dates"} · Generated in {baseCurrency}
          </div>
        </CardHeader>
        <CardContent ref={bodyRef}>
          {main}
        </CardContent>
      </Card>
    </div>
  );
}

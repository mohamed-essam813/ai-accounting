"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isTenantAdminRole, type AppRole } from "@/lib/auth";
import { getRegisterExportRowsForTenant } from "@/lib/actions/fixed-assets";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const SOURCES = [
  { v: "all", label: "All sources" },
  { v: "vendor_bill", label: "From bills" },
  { v: "manual", label: "Manual" },
  { v: "opening_balance", label: "Opening balance" },
] as const;

const AGE = [
  { v: "all", label: "Any age" },
  { v: "lt1", label: "< 1 year" },
  { v: "1to3", label: "1–3 years" },
  { v: "3to5", label: "3–5 years" },
  { v: "5plus", label: "5+ years" },
] as const;

function buildQuery(
  base: URLSearchParams,
  updates: Record<string, string | null | undefined>,
): string {
  const p = new URLSearchParams(base.toString());
  for (const [k, v] of Object.entries(updates)) {
    if (v == null || v === "" || v === "all") {
      p.delete(k);
    } else {
      p.set(k, v);
    }
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function RegisterFilters({ userRole, status }: { userRole: string | null; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [exporting, setExporting] = useState(false);

  const [category, setCategory] = useState(sp.get("category") ?? "");
  const [location, setLocation] = useState(sp.get("location") ?? "");
  const [assignee, setAssignee] = useState(sp.get("assignee") ?? "");
  const [pf, setPf] = useState(sp.get("pf") ?? "");
  const [pt, setPt] = useState(sp.get("pt") ?? "");

  const apply = useCallback(
    (extra: Record<string, string | null | undefined> = {}) => {
      start(() => {
        router.push(
          `${pathname}${buildQuery(sp, {
            status: status === "active" ? null : status,
            source: sp.get("source") ?? "all",
            category: extra.category !== undefined ? extra.category : category || null,
            location: extra.location !== undefined ? extra.location : location || null,
            assignee: extra.assignee !== undefined ? extra.assignee : assignee || null,
            pf: extra.pf !== undefined ? extra.pf : pf || null,
            pt: extra.pt !== undefined ? extra.pt : pt || null,
            age: sp.get("age") ?? "all",
            ...extra,
          })}`,
        );
      });
    },
    [assignee, category, location, pathname, pf, pt, router, sp, status],
  );

  const currentSource = sp.get("source") ?? "all";
  const currentAge = sp.get("age") ?? "all";

  const onExport = async () => {
    if (!isTenantAdminRole(userRole as AppRole)) {
      toast.error("Only administrators can export the register.");
      return;
    }
    setExporting(true);
    try {
      const { rows, displayCurrency } = await getRegisterExportRowsForTenant({
        status: status as "active" | "disposed" | "all",
        source: (currentSource as "all" | "vendor_bill" | "manual" | "opening_balance") || "all",
        category: category || undefined,
        location: location || undefined,
        assignee: assignee || undefined,
        purchaseFrom: pf || undefined,
        purchaseTo: pt || undefined,
        age: (currentAge as "all" | "lt1" | "1to3" | "3to5" | "5plus") || "all",
      });
      const sheet = XLSX.utils.json_to_sheet(
        rows.map((r) => ({
          Code: r.code,
          Name: r.name,
          Category: r.category,
          Cost: r.cost,
          "Accum. depr.": r.accDep,
          NBV: r.nbv,
          "Purchase date": r.purchase,
          Location: r.location,
          Assignee: r.assignee,
          Source: r.source,
          Status: r.status,
        })),
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, "Register");
      XLSX.writeFile(
        wb,
        `FixedAssets-${status}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`,
      );
      toast.success("Export ready (" + displayCurrency + ").");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const showExport = isTenantAdminRole(userRole as AppRole);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label>Source</Label>
          <Select
            value={currentSource}
            onValueChange={(v) => {
              start(() => router.push(`${pathname}${buildQuery(sp, { source: v })}`));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((s) => (
                <SelectItem key={s.v} value={s.v}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ff-age">Age</Label>
          <Select
            value={currentAge}
            onValueChange={(v) => {
              start(() => router.push(`${pathname}${buildQuery(sp, { age: v })}`));
            }}
          >
            <SelectTrigger id="ff-age">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGE.map((s) => (
                <SelectItem key={s.v} value={s.v}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="ff-cat">Category (contains)</Label>
          <Input
            id="ff-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Filter by category"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ff-loc">Location</Label>
          <Input id="ff-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Contains" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ff-asg">Assigned to</Label>
          <Input id="ff-asg" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Contains" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ff-pf">Purchase from</Label>
          <Input id="ff-pf" type="date" value={pf} onChange={(e) => setPf(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ff-pt">Purchase to</Label>
          <Input id="ff-pt" type="date" value={pt} onChange={(e) => setPt(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => apply()}>
          Apply filters
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setCategory("");
            setLocation("");
            setAssignee("");
            setPf("");
            setPt("");
            start(() => router.push(pathname + (status === "active" ? "" : `?status=${status}`)));
          }}
        >
          Clear
        </Button>
        {showExport && (
          <Button type="button" size="sm" variant="outline" disabled={exporting} onClick={onExport}>
            {exporting ? "Exporting…" : "Export to Excel"}
          </Button>
        )}
      </div>
    </div>
  );
}

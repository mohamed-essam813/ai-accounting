"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, FileDown, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { DocumentListShell } from "@/components/documents/document-list-shell";
import { DocumentWorkflowBadge, type WorkflowUiStatus } from "@/components/documents/document-workflow-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { loadStoredDateRange, rangeForPreset, saveStoredDateRange, type DatePresetId } from "@/lib/documents/document-list-dates";
import { useDebouncedValue } from "@/lib/documents/use-debounced-value";
import { isUnusuallyLargeAmount } from "@/lib/documents/large-amount";
import type { DocumentStatusFilter } from "@/lib/data/document-lists/types";
import type { BillListRow } from "@/lib/data/document-lists/bills-list";
import { deleteDraftAction, postDraftAction } from "@/lib/actions/drafts";

type Meta = {
  companyName: string;
  approvalEnabled: boolean;
  users: { id: string; label: string }[];
};

type ListResponse = {
  rows: BillListRow[];
  total: number;
  summary: { totalBilled: number; totalPaid: number; totalOutstanding: number; count: number };
  avg90: number | null;
};

const PRESETS: { id: DatePresetId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "last_quarter", label: "Last quarter" },
  { id: "this_year", label: "This year" },
];

function workflowToUi(row: BillListRow): WorkflowUiStatus {
  if (row.isOverdue && row.workflowStatus === "posted") return "overdue";
  return row.workflowStatus as WorkflowUiStatus;
}

function buildSearchParams(args: {
  status: DocumentStatusFilter;
  startDate: string;
  endDate: string;
  counterpartyIds: string[];
  search: string;
  amountMin: string;
  amountMax: string;
  createdBy: string;
  overdue: "yes" | "no" | "any";
  hasBillNumber: "yes" | "no" | "any";
  page: number;
  pageSize: number;
  sort: string;
  sortDir: string;
}): string {
  const sp = new URLSearchParams();
  sp.set("status", args.status);
  sp.set("startDate", args.startDate);
  sp.set("endDate", args.endDate);
  if (args.counterpartyIds.length) sp.set("counterpartyIds", args.counterpartyIds.join(","));
  if (args.search.trim()) sp.set("search", args.search.trim());
  if (args.amountMin) sp.set("amountMin", args.amountMin);
  if (args.amountMax) sp.set("amountMax", args.amountMax);
  if (args.createdBy) sp.set("createdBy", args.createdBy);
  if (args.overdue !== "any") sp.set("overdue", args.overdue);
  if (args.hasBillNumber !== "any") sp.set("hasBillNumber", args.hasBillNumber);
  sp.set("page", String(args.page));
  sp.set("pageSize", String(args.pageSize));
  sp.set("sort", args.sort);
  sp.set("sortDir", args.sortDir);
  return sp.toString();
}

export function BillListClient() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [status, setStatus] = useState<DocumentStatusFilter>("all");
  const [preset, setPreset] = useState<DatePresetId>("this_month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [counterpartyIds, setCounterpartyIds] = useState<string[]>([]);
  const [cpOpen, setCpOpen] = useState(false);
  const [cpQuery, setCpQuery] = useState("");
  const [cpResults, setCpResults] = useState<{ id: string; name: string; code: string }[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [overdue, setOverdue] = useState<"yes" | "no" | "any">("any");
  const [hasBillNumber, setHasBillNumber] = useState<"yes" | "no" | "any">("any");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [sort, setSort] = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [postingId, setPostingId] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredDateRange("bills");
    const r = stored ?? rangeForPreset("this_month");
    setStartDate(r.startDate);
    setEndDate(r.endDate);
  }, []);

  useEffect(() => {
    if (!startDate || !endDate) return;
    saveStoredDateRange("bills", { startDate, endDate });
  }, [startDate, endDate]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/document-lists/meta");
        if (!res.ok) return;
        setMeta(await res.json());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const queryString = useMemo(
    () =>
      buildSearchParams({
        status,
        startDate,
        endDate,
        counterpartyIds,
        search: debouncedSearch,
        amountMin,
        amountMax,
        createdBy,
        overdue,
        hasBillNumber,
        page,
        pageSize,
        sort,
        sortDir,
      }),
    [
      status,
      startDate,
      endDate,
      counterpartyIds,
      debouncedSearch,
      amountMin,
      amountMax,
      createdBy,
      overdue,
      hasBillNumber,
      page,
      sort,
      sortDir,
    ],
  );

  const refresh = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/document-lists/bills?${queryString}`);
      if (!res.ok) throw new Error("Failed to load");
      setData(await res.json());
    } catch {
      toast.error("Could not load bills.");
    } finally {
      setLoading(false);
    }
  }, [queryString, startDate, endDate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(cpQuery)}&kind=vendor`);
          if (!res.ok) return;
          const j = (await res.json()) as { contacts: { id: string; name: string; code: string }[] };
          setCpResults(j.contacts ?? []);
        } catch {
          setCpResults([]);
        }
      })();
    }, 200);
    return () => window.clearTimeout(t);
  }, [cpQuery, cpOpen]);

  const currency = (n: number, code?: string | null) => formatCurrency(n, (code || "AED").trim() || "AED");

  const clearFilters = () => {
    setStatus("all");
    setSearch("");
    setCounterpartyIds([]);
    setAmountMin("");
    setAmountMax("");
    setCreatedBy("");
    setOverdue("any");
    setHasBillNumber("any");
    const r = rangeForPreset("this_month");
    setStartDate(r.startDate);
    setEndDate(r.endDate);
    setPreset("this_month");
    setPage(1);
  };

  const exportRows = async (): Promise<BillListRow[]> => {
    if (!startDate || !endDate) return [];
    const sp = buildSearchParams({
      status,
      startDate,
      endDate,
      counterpartyIds,
      search: debouncedSearch,
      amountMin,
      amountMax,
      createdBy,
      overdue,
      hasBillNumber,
      page: 1,
      pageSize: 10000,
      sort,
      sortDir,
    });
    const res = await fetch(`/api/document-lists/bills?${sp}`);
    if (!res.ok) throw new Error("export failed");
    const j = (await res.json()) as ListResponse;
    if (j.total > 1000) {
      toast.message("Large export", {
        description: "Preparing download. For very large datasets, email delivery may be added later.",
      });
    }
    return j.rows;
  };

  const downloadCsv = async () => {
    const rows = await exportRows();
    const Papa = await import("papaparse");
    const csv = Papa.unparse(
      rows.map((r) => ({
        bill_number: r.billNumber,
        date: r.documentDate,
        vendor: r.vendorName,
        vendor_code: r.vendorCode,
        vendor_trn: r.vendorTrn,
        description: r.description,
        total: r.totalAmount,
        paid: r.paidAmount,
        outstanding: r.outstandingAmount,
        due_date: r.dueDate,
        status: r.workflowStatus,
        internal_notes: "",
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = URL.createObjectURL(blob);
    a.download = `${meta?.companyName ?? "Company"}Bills${startDate}-${endDate}_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadXlsx = async () => {
    const rows = await exportRows();
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        bill_number: r.billNumber,
        date: r.documentDate,
        vendor: r.vendorName,
        vendor_code: r.vendorCode,
        vendor_trn: r.vendorTrn,
        description: r.description,
        total: r.totalAmount,
        paid: r.paidAmount,
        outstanding: r.outstandingAmount,
        due_date: r.dueDate,
        status: r.workflowStatus,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bills");
    XLSX.writeFile(
      wb,
      `${meta?.companyName ?? "Company"}Bills${startDate}-${endDate}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`,
    );
  };

  const downloadPdf = async () => {
    const rows = await exportRows();
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(11);
    doc.text(`${meta?.companyName ?? "Company"} — Bills (${startDate} to ${endDate})`, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["#", "Date", "Vendor", "Total", "Paid", "Outstanding", "Due", "Status"]],
      body: rows.map((r) => [
        r.billNumber ?? "—",
        formatDate(r.documentDate),
        r.vendorName ?? "—",
        currency(r.totalAmount, r.currencyCode),
        currency(r.paidAmount, r.currencyCode),
        currency(r.outstandingAmount, r.currencyCode),
        r.dueDate ? formatDate(r.dueDate) : "—",
        r.workflowStatus,
      ]),
    });
    doc.save(
      `${meta?.companyName ?? "Company"}Bills${startDate}-${endDate}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.pdf`,
    );
  };

  const handlePostDraft = async (draftId: string) => {
    setPostingId(draftId);
    try {
      const res = await postDraftAction({ draftId });
      if (!res.success) {
        toast.error(res.error.message);
        return;
      }
      toast.success("Posted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not post");
    } finally {
      setPostingId(null);
    }
  };

  const handleVoidDraft = async (draftId: string) => {
    if (!window.confirm("Void this draft? It will be removed from the list.")) return;
    try {
      await deleteDraftAction({ draftId });
      toast.success("Draft voided");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not void draft");
    }
  };

  const voidPostedStub = () => {
    toast.message("Void", { description: "Full void/reversal workflow arrives in a later release." });
  };

  const empty = !loading && data && data.rows.length === 0;
  const noDataEver = empty && status === "all" && !debouncedSearch && counterpartyIds.length === 0;

  const statusChips: { id: DocumentStatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "draft", label: "Draft" },
    ...(meta?.approvalEnabled ? ([{ id: "pending_approval" as const, label: "Pending approval" }] as const) : []),
    { id: "approved", label: "Approved" },
    { id: "posted", label: "Posted" },
    { id: "voided", label: "Voided" },
    { id: "reversed", label: "Reversed" },
  ];

  return (
    <DocumentListShell
      title="Bills"
      subtitle="Supplier bills and drafts. Filter, review, and export."
      primaryAction={
        <Button asChild>
          <Link href="/prompt">
            <Plus className="h-4 w-4" />
            Create bill
          </Link>
        </Button>
      }
      stickyFilters={
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {statusChips.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                variant={status === c.id ? "default" : "outline"}
                className="h-8"
                onClick={() => {
                  setStatus(c.id);
                  setPage(1);
                }}
              >
                {c.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Date range</p>
              <div className="flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <Button
                    key={p.id}
                    type="button"
                    size="sm"
                    variant={preset === p.id ? "default" : "outline"}
                    className="h-8"
                    onClick={() => {
                      setPreset(p.id);
                      const r = rangeForPreset(p.id);
                      setStartDate(r.startDate);
                      setEndDate(r.endDate);
                      setPage(1);
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <div>
                <p className="text-xs text-muted-foreground">From</p>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-[150px]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">To</p>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 w-[150px]" />
              </div>
            </div>
            <Popover open={cpOpen} onOpenChange={setCpOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  Vendors{counterpartyIds.length ? ` (${counterpartyIds.length})` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <Input
                  placeholder="Search contacts…"
                  value={cpQuery}
                  onChange={(e) => setCpQuery(e.target.value)}
                  className="mb-2"
                />
                <div className="max-h-48 space-y-1 overflow-y-auto text-sm">
                  {cpResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={cn(
                        "flex w-full rounded px-2 py-1 text-left hover:bg-muted",
                        counterpartyIds.includes(c.id) && "bg-muted",
                      )}
                      onClick={() => {
                        setCounterpartyIds((prev) =>
                          prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                        );
                        setPage(1);
                      }}
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 text-muted-foreground">{c.code}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <div>
              <p className="text-xs text-muted-foreground">Search</p>
              <Input
                placeholder="Number, vendor, amount…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-[220px]"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1">
                  More filters
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 p-3">
                <DropdownMenuLabel>Amount</DropdownMenuLabel>
                <div className="flex gap-2">
                  <Input placeholder="Min" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} />
                  <Input placeholder="Max" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Created by</DropdownMenuLabel>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={createdBy}
                  onChange={(e) => setCreatedBy(e.target.value)}
                >
                  <option value="">Anyone</option>
                  {(meta?.users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Overdue</DropdownMenuLabel>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={overdue}
                  onChange={(e) => setOverdue(e.target.value as "yes" | "no" | "any")}
                >
                  <option value="any">Any</option>
                  <option value="yes">Overdue only</option>
                  <option value="no">Not overdue</option>
                </select>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Has bill number</DropdownMenuLabel>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={hasBillNumber}
                  onChange={(e) => setHasBillNumber(e.target.value as "yes" | "no" | "any")}
                >
                  <option value="any">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      }
      loading={loading}
      loadingPlaceholder={
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      }
      footer={
        <div className="space-y-4 border-t pt-4">
          {data ? (
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Total billed </span>
                <span className="font-medium tabular-nums">{currency(data.summary.totalBilled, "AED")}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total paid </span>
                <span className="font-medium tabular-nums">{currency(data.summary.totalPaid, "AED")}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Outstanding </span>
                <span className="font-medium tabular-nums">{currency(data.summary.totalOutstanding, "AED")}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Count </span>
                <span className="font-medium tabular-nums">{data.summary.count}</span>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Page {page}
              {data ? ` · ${data.total} results` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={data ? page * pageSize >= data.total : true}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void downloadCsv()}>CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void downloadXlsx()}>Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void downloadPdf()}>PDF</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      }
    >
      {noDataEver ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">No bills yet.</p>
          <Button asChild variant="link" className="mt-2">
            <Link href="/prompt">Create your first bill →</Link>
          </Button>
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">No bills match your filters.</p>
          <Button type="button" variant="link" className="mt-2" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => setSort("number")}>
                  Bill #
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => setSort("date")}>
                  Date
                </TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows ?? []).map((row) => {
                const cc = row.currencyCode || "AED";
                const large = isUnusuallyLargeAmount(Math.abs(row.totalAmount), data?.avg90 ?? null);
                const uiStatus = workflowToUi(row);
                const settlement = row.settlementStatus || "";
                const showStrikeVoid = row.workflowStatus === "voided";

                return (
                  <TableRow key={row.rowKey} className={cn(showStrikeVoid && "opacity-70")}>
                    <TableCell className="font-mono text-sm">
                      {row.source === "posted" ? (
                        <Link href={`/bills/${row.id}`} className="text-primary hover:underline">
                          {row.billNumber ?? "—"}
                        </Link>
                      ) : (
                        <span>{row.billNumber ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(row.documentDate)}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm">{row.vendorName ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{row.description ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <span className={cn("inline-flex items-center justify-end gap-1 tabular-nums", showStrikeVoid && "line-through")}>
                        {currency(row.totalAmount, cc)}
                        {large ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Large amount" />
                              </TooltipTrigger>
                              <TooltipContent>Unusually large amount. Verify before posting.</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className={cn("text-right font-mono text-sm tabular-nums", showStrikeVoid && "line-through")}>
                      {currency(row.paidAmount, cc)}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono text-sm tabular-nums", showStrikeVoid && "line-through")}>
                      {currency(row.outstandingAmount, cc)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {row.dueDate ? formatDate(row.dueDate) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {uiStatus === "overdue" ? (
                          <>
                            <DocumentWorkflowBadge status="posted" />
                            <DocumentWorkflowBadge status="overdue" />
                          </>
                        ) : (
                          <DocumentWorkflowBadge status={uiStatus} />
                        )}
                        {row.source === "posted" && settlement && row.workflowStatus === "posted" ? (
                          <span className="text-[10px] text-muted-foreground">({settlement})</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <BillRowActions
                        row={row}
                        postingId={postingId}
                        onPost={() => void handlePostDraft(row.draftId!)}
                        onVoidDraft={() => void handleVoidDraft(row.draftId!)}
                        onVoidPosted={voidPostedStub}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </DocumentListShell>
  );
}

function BillRowActions({
  row,
  postingId,
  onPost,
  onVoidDraft,
  onVoidPosted,
}: {
  row: BillListRow;
  postingId: string | null;
  onPost: () => void;
  onVoidDraft: () => void;
  onVoidPosted: () => void;
}) {
  if (row.source === "draft") {
    return (
      <div className="flex justify-end gap-1">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/drafts?openDraft=${row.draftId}`}>Edit</Link>
        </Button>
        <Button variant="default" size="sm" disabled={postingId === row.draftId} onClick={onPost}>
          Post
        </Button>
        <Button variant="ghost" size="sm" onClick={onVoidDraft}>
          Void
        </Button>
      </div>
    );
  }

  const st = row.workflowStatus;
  const settlement = row.settlementStatus || "";

  if (st === "voided" || st === "reversed") {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href={`/bills/${row.id}`}>View</Link>
      </Button>
    );
  }

  if (st === "posted") {
    const unpaid = settlement === "unpaid";
    const partial = settlement === "partial";
    const paid = settlement === "paid";

    return (
      <div className="flex flex-wrap justify-end gap-1">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/bills/${row.id}`}>View</Link>
        </Button>
        {(unpaid || partial) ? (
          <Button variant="secondary" size="sm" asChild>
            <Link href="/prompt">Record payment</Link>
          </Button>
        ) : null}
        {unpaid ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => toast.message("Schedule payment", { description: "Scheduled payments coming soon." })}
          >
            Schedule payment
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" type="button" onClick={onVoidPosted}>
          Void
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={`/api/bills/${row.id}/pdf`} target="_blank" rel="noreferrer">
            <FileDown className="h-4 w-4" />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`/bills/${row.id}`}>View</Link>
    </Button>
  );
}

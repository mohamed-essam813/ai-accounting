"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Download, FileDown, MoreHorizontal, Plus } from "lucide-react";
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
import type { PaymentListRow } from "@/lib/data/document-lists/payments-list";
import { deleteDraftAction, postDraftAction } from "@/lib/actions/drafts";

type Meta = { companyName: string; approvalEnabled: boolean; users: { id: string; label: string }[] };

type ListResponse = {
  rows: PaymentListRow[];
  total: number;
  summary: { totalIn: number; totalOut: number; net: number; count: number };
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

function workflowToUi(row: PaymentListRow): WorkflowUiStatus {
  return row.workflowStatus as WorkflowUiStatus;
}

function buildSearchParams(args: {
  status: DocumentStatusFilter;
  direction: "all" | "in" | "out";
  startDate: string;
  endDate: string;
  counterpartyIds: string[];
  search: string;
  amountMin: string;
  amountMax: string;
  createdBy: string;
  page: number;
  pageSize: number;
  sort: string;
  sortDir: string;
}): string {
  const sp = new URLSearchParams();
  sp.set("status", args.status);
  sp.set("direction", args.direction);
  sp.set("startDate", args.startDate);
  sp.set("endDate", args.endDate);
  if (args.counterpartyIds.length) sp.set("counterpartyIds", args.counterpartyIds.join(","));
  if (args.search.trim()) sp.set("search", args.search.trim());
  if (args.amountMin) sp.set("amountMin", args.amountMin);
  if (args.amountMax) sp.set("amountMax", args.amountMax);
  if (args.createdBy) sp.set("createdBy", args.createdBy);
  sp.set("page", String(args.page));
  sp.set("pageSize", String(args.pageSize));
  sp.set("sort", args.sort);
  sp.set("sortDir", args.sortDir);
  return sp.toString();
}

export function PaymentsListClient() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
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
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [sort, setSort] = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [postingId, setPostingId] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredDateRange("payments");
    const r = stored ?? rangeForPreset("this_month");
    setStartDate(r.startDate);
    setEndDate(r.endDate);
  }, []);

  useEffect(() => {
    if (!startDate || !endDate) return;
    saveStoredDateRange("payments", { startDate, endDate });
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
        direction,
        startDate,
        endDate,
        counterpartyIds,
        search: debouncedSearch,
        amountMin,
        amountMax,
        createdBy,
        page,
        pageSize,
        sort,
        sortDir,
      }),
    [
      status,
      direction,
      startDate,
      endDate,
      counterpartyIds,
      debouncedSearch,
      amountMin,
      amountMax,
      createdBy,
      page,
      sort,
      sortDir,
    ],
  );

  const refresh = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/document-lists/payments?${queryString}`);
      if (!res.ok) throw new Error("Failed to load");
      setData(await res.json());
    } catch {
      toast.error("Could not load payments.");
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
          const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(cpQuery)}`);
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
    setDirection("all");
    setSearch("");
    setCounterpartyIds([]);
    setAmountMin("");
    setAmountMax("");
    setCreatedBy("");
    const r = rangeForPreset("this_month");
    setStartDate(r.startDate);
    setEndDate(r.endDate);
    setPreset("this_month");
    setPage(1);
  };

  const exportRows = async (): Promise<PaymentListRow[]> => {
    if (!startDate || !endDate) return [];
    const sp = buildSearchParams({
      status,
      direction,
      startDate,
      endDate,
      counterpartyIds,
      search: debouncedSearch,
      amountMin,
      amountMax,
      createdBy,
      page: 1,
      pageSize: 10000,
      sort,
      sortDir,
    });
    const res = await fetch(`/api/document-lists/payments?${sp}`);
    if (!res.ok) throw new Error("export failed");
    return ((await res.json()) as ListResponse).rows;
  };

  const downloadCsv = async () => {
    const rows = await exportRows();
    const Papa = await import("papaparse");
    const csv = Papa.unparse(
      rows.map((r) => ({
        date: r.paymentDate,
        direction: r.direction === "in" ? "Money in" : "Money out",
        counterparty: r.contactName,
        counterparty_code: r.contactCode,
        counterparty_trn: r.contactTrn,
        description: r.description,
        amount: r.amount,
        account: r.bankAccountLabel,
        reference: r.reference,
        voucher: r.voucherNumber,
        status: r.workflowStatus,
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = URL.createObjectURL(blob);
    a.download = `${meta?.companyName ?? "Company"}Payments${startDate}-${endDate}_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadXlsx = async () => {
    const rows = await exportRows();
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        date: r.paymentDate,
        direction: r.direction === "in" ? "Money in" : "Money out",
        counterparty: r.contactName,
        counterparty_code: r.contactCode,
        counterparty_trn: r.contactTrn,
        description: r.description,
        amount: r.amount,
        account: r.bankAccountLabel,
        reference: r.reference,
        voucher: r.voucherNumber,
        status: r.workflowStatus,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payments");
    XLSX.writeFile(
      wb,
      `${meta?.companyName ?? "Company"}Payments${startDate}-${endDate}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`,
    );
  };

  const downloadPdf = async () => {
    const rows = await exportRows();
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(11);
    doc.text(`${meta?.companyName ?? "Company"} — Payments (${startDate} to ${endDate})`, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["Date", "Direction", "Counterparty", "Amount", "Account", "Reference", "Status"]],
      body: rows.map((r) => [
        formatDate(r.paymentDate),
        r.direction === "in" ? "In" : "Out",
        r.contactName ?? "—",
        currency(r.amount, r.currencyCode),
        r.bankAccountLabel ?? "—",
        r.reference ?? "—",
        r.workflowStatus,
      ]),
    });
    doc.save(
      `${meta?.companyName ?? "Company"}Payments${startDate}-${endDate}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.pdf`,
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
    if (!window.confirm("Void this draft?")) return;
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
  const noDataEver = empty && status === "all" && direction === "all" && !debouncedSearch && counterpartyIds.length === 0;

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
      title="Payments"
      subtitle="Receipts and payments. Filter by direction, status, and date."
      primaryAction={
        <Button asChild>
          <Link href="/prompt">
            <Plus className="h-4 w-4" />
            Record payment
          </Link>
        </Button>
      }
      stickyFilters={
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Direction</p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "all" as const, label: "All" },
                  { id: "in" as const, label: "Money in" },
                  { id: "out" as const, label: "Money out" },
                ] as const
              ).map((d) => (
                <Button
                  key={d.id}
                  type="button"
                  size="sm"
                  variant={direction === d.id ? "default" : "outline"}
                  className="h-8"
                  onClick={() => {
                    setDirection(d.id);
                    setPage(1);
                  }}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>
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
                  Counterparty{counterpartyIds.length ? ` (${counterpartyIds.length})` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <Input placeholder="Search…" value={cpQuery} onChange={(e) => setCpQuery(e.target.value)} className="mb-2" />
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
                placeholder="Voucher, reference, amount…"
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
                <span className="text-muted-foreground">Total in </span>
                <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                  {currency(data.summary.totalIn, "AED")}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Total out </span>
                <span className="font-medium tabular-nums text-red-700 dark:text-red-400">
                  {currency(data.summary.totalOut, "AED")}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Net </span>
                <span className="font-medium tabular-nums">{currency(data.summary.net, "AED")}</span>
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
          <p className="text-muted-foreground">No payments yet.</p>
          <Button asChild variant="link" className="mt-2">
            <Link href="/prompt">Record your first payment →</Link>
          </Button>
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">No payments match your filters.</p>
          <Button type="button" variant="link" className="mt-2" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows ?? []).map((row) => {
                const cc = row.currencyCode || "AED";
                const large = isUnusuallyLargeAmount(Math.abs(row.amount), data?.avg90 ?? null);
                const ui = workflowToUi(row);

                return (
                  <TableRow key={row.rowKey}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(row.paymentDate)}</TableCell>
                    <TableCell>
                      {row.direction === "in" ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          <ArrowDownLeft className="h-4 w-4" aria-hidden />
                          Money in
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-red-700 dark:text-red-400">
                          <ArrowUpRight className="h-4 w-4" aria-hidden />
                          Money out
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-sm">{row.contactName ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{row.description ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <span className="inline-flex items-center justify-end gap-1 tabular-nums">
                        {currency(row.amount, cc)}
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
                    <TableCell className="max-w-[140px] truncate text-sm">{row.bankAccountLabel ?? "—"}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-sm text-muted-foreground">{row.reference ?? "—"}</TableCell>
                    <TableCell>
                      <DocumentWorkflowBadge status={ui} />
                    </TableCell>
                    <TableCell className="text-right">
                      <PaymentRowActions
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

function PaymentRowActions({
  row,
  postingId,
  onPost,
  onVoidDraft,
  onVoidPosted,
}: {
  row: PaymentListRow;
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

  if (st === "voided" || st === "reversed") {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href={`/payments/${row.id}`}>View</Link>
      </Button>
    );
  }

  if (st === "posted") {
    return (
      <div className="flex flex-wrap justify-end gap-1">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/payments/${row.id}`}>View</Link>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => toast.message("Allocate", { description: "Allocation to invoices/bills coming soon." })}
        >
          Allocate
        </Button>
        <Button variant="ghost" size="sm" type="button" onClick={onVoidPosted}>
          Void
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={`/api/payments/${row.id}/pdf`} target="_blank" rel="noreferrer">
            <FileDown className="h-4 w-4" />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`/payments/${row.id}`}>View</Link>
    </Button>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useTransition } from "react";
import { Search } from "lucide-react";

type Account = { id: string; code: string; name: string };

type Props = {
  initialStartDate?: string;
  initialEndDate?: string;
  initialAccountCode?: string;
  initialSearch?: string;
  initialStatus?: string;
  accounts?: Account[];
};

export function JournalFilters({
  initialStartDate,
  initialEndDate,
  initialAccountCode,
  initialSearch,
  initialStatus,
  accounts = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [startDate, setStartDate] = useState(initialStartDate ?? "");
  const [endDate, setEndDate] = useState(initialEndDate ?? "");
  const [accountCode, setAccountCode] = useState(initialAccountCode ?? "all");
  const [search, setSearch] = useState(initialSearch ?? "");
  const [status, setStatus] = useState(initialStatus ?? "all");
  const [isPending, startTransition] = useTransition();

  const applyDateRange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", start);
      params.set("endDate", end);
      router.push(`/journals?${params.toString()}`);
    });
  };

  const handleApply = () => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (startDate) params.set("startDate", startDate);
      else params.delete("startDate");
      if (endDate) params.set("endDate", endDate);
      else params.delete("endDate");
      if (accountCode && accountCode !== "all") params.set("accountCode", accountCode);
      else params.delete("accountCode");
      if (search.trim()) params.set("search", search.trim());
      else params.delete("search");
      if (status && status !== "all") params.set("status", status);
      else params.delete("status");
      const q = params.toString();
      router.push(q ? `/journals?${q}` : "/journals");
    });
  };

  const handleClear = () => {
    setStartDate("");
    setEndDate("");
    setAccountCode("all");
    setSearch("");
    setStatus("all");
    startTransition(() => router.push("/journals"));
  };

  const getPresetDates = (preset: "monthly" | "quarterly" | "yearly") => {
    const today = new Date();
    let start: Date;
    const end = new Date(today);
    switch (preset) {
      case "monthly":
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case "quarterly":
        start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
        break;
      case "yearly":
        start = new Date(today.getFullYear(), 0, 1);
        break;
    }
    return {
      start: start!.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  };

  const hasFilters = startDate || endDate || (accountCode && accountCode !== "all") || search.trim() || (status && status !== "all");

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Start</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">End</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
        </div>
        {accounts.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Account</label>
            <Select value={accountCode} onValueChange={setAccountCode}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.code}>
                    {a.code} · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 pl-8"
            />
          </div>
        </div>
        <Button onClick={handleApply} disabled={isPending} size="sm">
          Apply
        </Button>
        {hasFilters && (
          <Button onClick={handleClear} variant="outline" size="sm" disabled={isPending}>
            Clear
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">Presets:</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const d = getPresetDates("monthly");
            applyDateRange(d.start, d.end);
          }}
          disabled={isPending}
        >
          This Month
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const d = getPresetDates("quarterly");
            applyDateRange(d.start, d.end);
          }}
          disabled={isPending}
        >
          This Quarter
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const d = getPresetDates("yearly");
            applyDateRange(d.start, d.end);
          }}
          disabled={isPending}
        >
          This Year
        </Button>
      </div>
    </div>
  );
}

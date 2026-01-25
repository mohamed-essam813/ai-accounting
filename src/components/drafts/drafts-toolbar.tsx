"use client";

import { useMemo, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export type DocumentTypeTab =
  | "all"
  | "invoices"
  | "bills"
  | "payments"
  | "credit_debit"
  | "other";

type DraftForFilter = {
  id: string;
  intent: string;
  status: string;
  entities: {
    counterparty?: string | null;
    amount?: number;
    description?: string | null;
    invoice_number?: string | null;
    currency?: string;
  };
  created_at?: string;
  [k: string]: unknown;
};

type DraftsToolbarProps<T extends DraftForFilter = DraftForFilter> = {
  drafts: T[];
  onFilteredChange: (filtered: T[]) => void;
  className?: string;
};

const TAB_TO_INTENTS: Record<DocumentTypeTab, string[] | null> = {
  all: null,
  invoices: ["create_invoice"],
  bills: ["create_bill"],
  payments: ["record_payment", "reconcile_bank"],
  credit_debit: ["create_credit_note", "create_debit_note"],
  other: ["generate_report"],
};

const ALL_TAB_INTENTS = [
  ...(TAB_TO_INTENTS.invoices ?? []),
  ...(TAB_TO_INTENTS.bills ?? []),
  ...(TAB_TO_INTENTS.payments ?? []),
  ...(TAB_TO_INTENTS.credit_debit ?? []),
  ...(TAB_TO_INTENTS.other ?? []),
];

export function DraftsToolbar<T extends DraftForFilter>({
  drafts,
  onFilteredChange,
  className,
}: DraftsToolbarProps<T>) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<DocumentTypeTab>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo((): T[] => {
    let result = [...drafts];

    const intents = TAB_TO_INTENTS[tab];
    if (intents !== null) {
      result =
        tab === "other"
          ? result.filter(
              (d) =>
                intents.includes(d.intent) || !ALL_TAB_INTENTS.includes(d.intent)
            )
          : result.filter((d) => intents.includes(d.intent));
    }

    if (statusFilter !== "all") {
      result = result.filter((d) => d.status === statusFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((d) => {
        const cp = (d.entities.counterparty ?? "").toLowerCase();
        const desc = (d.entities.description ?? "").toLowerCase();
        const amt = String(d.entities.amount ?? "");
        const inv = (d.entities.invoice_number ?? "").toLowerCase();
        const curr = (d.entities.currency ?? "").toLowerCase();
        const stat = d.status.toLowerCase();
        return (
          cp.includes(q) ||
          desc.includes(q) ||
          amt.includes(q) ||
          inv.includes(q) ||
          curr.includes(q) ||
          stat.includes(q)
        );
      });
    }

    return result;
  }, [drafts, tab, statusFilter, search]);

  const filteredIds = useMemo(() => filtered.map((d) => d.id).join(","), [filtered]);
  useEffect(() => {
    onFilteredChange(filtered);
  }, [filteredIds, onFilteredChange]);

  const handleTabChange = (v: string) => {
    setTab(v as DocumentTypeTab);
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="bills">Bills</TabsTrigger>
            <TabsTrigger value="payments">Payments & Receipts</TabsTrigger>
            <TabsTrigger value="credit_debit">Credit/Debit Notes</TabsTrigger>
            <TabsTrigger value="other">Other</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search counterparty, amount, description, invoice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {filtered.length} of {drafts.length} draft{filtered.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

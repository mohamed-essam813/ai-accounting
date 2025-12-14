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
import { Search, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  initialSearch?: string;
  initialInvoiceNumber?: string;
  initialBillNumber?: string;
  initialContact?: string;
  initialAmount?: string;
  initialDate?: string;
  initialAction?: string;
};

export function AuditLogSearch({
  initialSearch,
  initialInvoiceNumber,
  initialBillNumber,
  initialContact,
  initialAmount,
  initialDate,
  initialAction,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoiceNumber ?? "");
  const [billNumber, setBillNumber] = useState(initialBillNumber ?? "");
  const [contact, setContact] = useState(initialContact ?? "");
  const [amount, setAmount] = useState(initialAmount ?? "");
  const [date, setDate] = useState(initialDate ?? "");
  const [action, setAction] = useState(initialAction ?? "");
  const [isPending, startTransition] = useTransition();

  const handleSearch = () => {
    startTransition(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (invoiceNumber.trim()) params.set("invoiceNumber", invoiceNumber.trim());
      if (billNumber.trim()) params.set("billNumber", billNumber.trim());
      if (contact.trim()) params.set("contact", contact.trim());
      if (amount.trim()) params.set("amount", amount.trim());
      if (date.trim()) params.set("date", date.trim());
      if (action.trim() && action !== "all") params.set("action", action.trim());
      router.push(`/audit?${params.toString()}`);
    });
  };

  const handleClear = () => {
    setSearch("");
    setInvoiceNumber("");
    setBillNumber("");
    setContact("");
    setAmount("");
    setDate("");
    setAction("");
    startTransition(() => {
      router.push("/audit");
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const hasFilters = search || invoiceNumber || billNumber || contact || amount || date || action;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Search Audit Log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="General search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9"
            />
          </div>
          <Input
            placeholder="Invoice Number"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Input
            placeholder="Bill Number"
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Input
            placeholder="Contact/Counterparty"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Input
            type="number"
            step="0.01"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Input
            type="date"
            placeholder="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Select 
            value={action || "all"} 
            onValueChange={(value) => setAction(value === "all" ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Action Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="draft.created">Created</SelectItem>
              <SelectItem value="draft.updated">Edited</SelectItem>
              <SelectItem value="draft.approved">Approved</SelectItem>
              <SelectItem value="draft.posted">Posted</SelectItem>
              <SelectItem value="journal_entry.created">Journal Entry Created</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSearch} disabled={isPending}>
            {isPending ? "Searching..." : "Search"}
          </Button>
          {hasFilters && (
            <Button variant="outline" onClick={handleClear} disabled={isPending}>
              Clear All
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


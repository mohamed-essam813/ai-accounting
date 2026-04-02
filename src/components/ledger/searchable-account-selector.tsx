"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Search, ChevronDown } from "lucide-react";
import { dedupeEntitiesForDisplay } from "@/lib/utils/entity-dedupe";

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type Props = {
  accounts: Account[];
  selectedAccountCode?: string;
};

export function SearchableAccountSelector({ accounts, selectedAccountCode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const sortedAccounts = useMemo(() => {
    const deduped = dedupeEntitiesForDisplay(
      accounts.map((a) => ({ ...a }) as unknown as Record<string, unknown>),
      { idKey: "id", entityLabel: "ledger-account-selector" },
    ) as Account[];
    return [...deduped].sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedAccounts;
    return sortedAccounts.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q)
    );
  }, [sortedAccounts, query]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (accountCode: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (accountCode && accountCode !== "all") {
      params.set("accountCode", accountCode);
    } else {
      params.delete("accountCode");
    }
    router.push(`/ledger?${params.toString()}`);
    setOpen(false);
  };

  const selected = selectedAccountCode
    ? sortedAccounts.find((a) => a.code === selectedAccountCode)
    : null;

  return (
    <Card ref={containerRef} className="relative">
      <CardContent className="pt-6">
        <div className="space-y-2">
          <Label htmlFor="account-selector" className="text-sm font-medium whitespace-nowrap">
            Select Account
          </Label>
          <div className="relative w-[400px]">
            <button
              type="button"
              id="account-selector"
              onClick={() => setOpen((o) => !o)}
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="truncate">
                {selected ? `${selected.code} — ${selected.name}` : "All Accounts (General Ledger)"}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </button>
            {open && (
              <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border bg-card shadow-lg">
                <div className="p-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={inputRef}
                      placeholder="Search by code or name…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="max-h-[280px] overflow-auto border-t p-1">
                  <button
                    type="button"
                    onClick={() => handleSelect("all")}
                    className="w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
                  >
                    All Accounts (General Ledger)
                  </button>
                  {filtered.map((account) => (
                    <button
                      type="button"
                      key={account.id}
                      onClick={() => handleSelect(account.code)}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-mono text-xs">{account.code}</span>
                      <span className="text-muted-foreground">—</span>
                      <span className="flex-1 truncate">{account.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {account.type}
                      </span>
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No account matches &quot;{query}&quot;
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedAccountCode
              ? "Showing transactions for the selected account with running balance."
              : "Select an account to view its general ledger with running balance, or view all accounts."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

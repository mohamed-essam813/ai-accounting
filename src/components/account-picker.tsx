"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronsUpDown, Check, Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { UserRole } from "@/lib/auth";

export type CoAAccount = {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  category: "current" | "non_current" | null;
};

// ─── Module-level CoA cache (shared across all pickers on the page) ───────────
let _coaCache: CoAAccount[] | null = null;
let _coaCacheTs = 0;
const COA_CACHE_TTL_MS = 60_000;

async function fetchCoA(): Promise<CoAAccount[]> {
  if (_coaCache && Date.now() - _coaCacheTs < COA_CACHE_TTL_MS) {
    return _coaCache;
  }
  const res = await fetch("/api/chart-of-accounts");
  if (!res.ok) throw new Error("Failed to load chart of accounts");
  const data: CoAAccount[] = await res.json();
  _coaCache = data;
  _coaCacheTs = Date.now();
  return data;
}

/** Invalidate the module cache — call after creating a new account. */
export function invalidateCoACache() {
  _coaCache = null;
}

// ─── Recently-used localStorage helpers ──────────────────────────────────────
const RECENT_KEY = (userId: string) => `je_recent_accts_${userId}`;
const RECENT_LIMIT = 5;

function getRecentCodes(userId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY(userId)) ?? "[]");
  } catch {
    return [];
  }
}

function pushRecentCode(userId: string, code: string) {
  const existing = getRecentCodes(userId);
  const updated = [code, ...existing.filter((c) => c !== code)].slice(0, RECENT_LIMIT);
  localStorage.setItem(RECENT_KEY(userId), JSON.stringify(updated));
}

// ─── Type badge colours ───────────────────────────────────────────────────────
const TYPE_COLORS: Record<CoAAccount["type"], string> = {
  asset:     "bg-blue-50 text-blue-700 border-blue-200",
  liability: "bg-orange-50 text-orange-700 border-orange-200",
  equity:    "bg-purple-50 text-purple-700 border-purple-200",
  revenue:   "bg-green-50 text-green-700 border-green-200",
  expense:   "bg-red-50 text-red-700 border-red-200",
};

const TYPE_LABELS: Record<CoAAccount["type"], string> = {
  asset: "Asset", liability: "Liability", equity: "Equity",
  revenue: "Revenue", expense: "Expense",
};

const ACCOUNT_TYPES: CoAAccount["type"][] = [
  "asset", "liability", "equity", "revenue", "expense",
];

// ─── Fuzzy search: matches if every char of query appears in order ────────────
function fuzzyMatch(target: string, query: string): boolean {
  const t = target.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    ti = t.indexOf(q[qi], ti);
    if (ti === -1) return false;
    ti++;
  }
  return true;
}

function matchesQuery(a: CoAAccount, q: string): boolean {
  if (!q) return true;
  return fuzzyMatch(a.code, q) || fuzzyMatch(a.name, q) || fuzzyMatch(`${a.code} ${a.name}`, q);
}

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  value: CoAAccount | null;
  onChange: (account: CoAAccount | null) => void;
  userId: string;
  userRole: UserRole;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  /** Pre-loaded CoA to avoid re-fetching when the parent already has it. */
  coa?: CoAAccount[];
};

export function AccountPicker({
  value,
  onChange,
  userId,
  userRole,
  placeholder = "Select account…",
  disabled = false,
  hasError = false,
  coa: coaProp,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coa, setCoa] = useState<CoAAccount[]>(coaProp ?? []);
  const [recentCodes, setRecentCodes] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CoAAccount["type"]>("expense");
  const [newCategory, setNewCategory] = useState<"current" | "non_current" | "">("");
  const [creating, setCreating] = useState(false);

  // Load CoA and recently-used on open
  useEffect(() => {
    if (!coaProp) {
      fetchCoA().then(setCoa).catch(() => {});
    }
  }, [coaProp]);

  useEffect(() => {
    if (coaProp) setCoa(coaProp);
  }, [coaProp]);

  const refreshRecent = useCallback(() => {
    setRecentCodes(getRecentCodes(userId));
  }, [userId]);

  useEffect(() => {
    if (open) refreshRecent();
  }, [open, refreshRecent]);

  const accountById = useMemo(() => new Map(coa.map((a) => [a.id, a])), [coa]);
  const accountByCode = useMemo(() => new Map(coa.map((a) => [a.code, a])), [coa]);

  const recentAccounts = useMemo(
    () => recentCodes.flatMap((c) => (accountByCode.get(c) ? [accountByCode.get(c)!] : [])),
    [recentCodes, accountByCode],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return coa;
    return coa.filter((a) => matchesQuery(a, query.trim()));
  }, [coa, query]);

  const groupedFiltered = useMemo(() => {
    const groups = new Map<CoAAccount["type"], CoAAccount[]>();
    for (const type of ACCOUNT_TYPES) groups.set(type, []);
    for (const a of filtered) groups.get(a.type)!.push(a);
    return groups;
  }, [filtered]);

  const handleSelect = (account: CoAAccount) => {
    onChange(account);
    pushRecentCode(userId, account.code);
    setOpen(false);
    setQuery("");
  };

  const canCreateAccount = userRole === "admin" || userRole === "accountant";

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          category: newCategory || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create account");
      }
      const created = await res.json();
      // Refresh the cache and local CoA list
      invalidateCoACache();
      const freshCoa = await fetchCoA();
      setCoa(freshCoa);
      const newAcc = freshCoa.find((a) => a.id === created.account_id) ?? {
        id: created.account_id,
        code: created.code,
        name: created.name,
        type: newType,
        category: (newCategory || null) as "current" | "non_current" | null,
      };
      handleSelect(newAcc);
      setCreateOpen(false);
      setNewName("");
      toast.success(`Account "${created.name}" created`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create account");
    } finally {
      setCreating(false);
    }
  };

  // Suppress id warning in console
  void accountById;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal text-left h-9",
              !value && "text-muted-foreground",
              hasError && "border-destructive ring-1 ring-destructive",
            )}
          >
            <span className="truncate">
              {value ? `${value.code} — ${value.name}` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[340px] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex flex-col">
            {/* Search */}
            <div className="border-b p-2">
              <Input
                placeholder="Search by code or name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-y-auto">
              {/* Recently used */}
              {!query && recentAccounts.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <Clock className="h-3 w-3" />
                    Recently Used
                  </div>
                  {recentAccounts.map((a) => (
                    <AccountRow
                      key={`recent-${a.code}`}
                      account={a}
                      selected={value?.id === a.id}
                      onSelect={handleSelect}
                    />
                  ))}
                  <div className="mx-3 border-t my-1" />
                </div>
              )}

              {/* Grouped results */}
              {ACCOUNT_TYPES.map((type) => {
                const items = groupedFiltered.get(type) ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={type}>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {TYPE_LABELS[type]}
                    </div>
                    {items.map((a) => (
                      <AccountRow
                        key={a.id}
                        account={a}
                        selected={value?.id === a.id}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <p className="px-3 py-4 text-sm text-center text-muted-foreground">
                  No accounts match &ldquo;{query}&rdquo;
                </p>
              )}
            </div>

            {/* Create new account (accountant / admin only) */}
            {canCreateAccount && (
              <div className="border-t p-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm text-primary hover:bg-accent"
                  onClick={() => {
                    setOpen(false);
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Create new account
                  {query.trim() ? `: "${query.trim()}"` : ""}
                </button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Create account dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Account Name</Label>
              <Input
                placeholder="e.g. Office Supplies"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as CoAAccount["type"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(newType === "asset" || newType === "liability") && (
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={newCategory} onValueChange={(v) => setNewCategory(v as "current" | "non_current" | "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="non_current">Non-current</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={!newName.trim() || creating}>
              {creating ? "Creating…" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Sub-component: single account row in the dropdown ───────────────────────
function AccountRow({
  account,
  selected,
  onSelect,
}: {
  account: CoAAccount;
  selected: boolean;
  onSelect: (a: CoAAccount) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent",
        selected && "bg-accent",
      )}
      onClick={() => onSelect(account)}
    >
      <Check className={cn("h-3.5 w-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")} />
      <span className="flex-1 truncate">
        <span className="font-mono text-xs text-muted-foreground mr-1.5">{account.code}</span>
        {account.name}
      </span>
      <Badge
        variant="outline"
        className={cn("text-[10px] px-1.5 py-0 shrink-0", TYPE_COLORS[account.type])}
      >
        {TYPE_LABELS[account.type]}
      </Badge>
    </button>
  );
}

// Re-export for consumers that want to display a label without opening the picker
export { TYPE_LABELS, TYPE_COLORS };

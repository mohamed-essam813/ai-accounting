"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn, getErrorMessage } from "@/lib/utils";
import { dedupeEntitiesForDisplay } from "@/lib/utils/entity-dedupe";
import {
  DUPLICATE_WARNING_SCORE,
  accountNameSimilarityScore,
  findSimilarAccountOptions,
} from "@/lib/accounts/account-name-similarity";
import { toast } from "sonner";

export type AccountOption = { id: string; name: string; code: string; type: string };

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

type Props = {
  id?: string;
  label: string;
  placeholder: string;
  value: AccountOption | null;
  onChange: (acc: AccountOption | null) => void;
  accounts: AccountOption[];
  typeFilter?: (t: string) => boolean;
  disabled?: boolean;
  /**
   * When set, user can create an account from the search query (no navigation away).
   * Type should match the field context (e.g. expense for bill expense category).
   */
  inlineCreateAccountType?: AccountType;
  /** Called after a successful inline create so parent can reload chart data. */
  onAccountsRefresh?: () => void | Promise<void>;
};

function defaultClassificationHint(t: AccountType): string {
  switch (t) {
    case "expense":
      return "P&L: Operating expense (default)";
    case "revenue":
      return "P&L: Revenue (default)";
    case "asset":
      return "Balance sheet: asset (code range sets current vs non-current)";
    case "liability":
      return "Balance sheet: liability (code range sets category)";
    case "equity":
      return "Equity";
    default:
      return "";
  }
}

export function AccountCombobox({
  id,
  label,
  placeholder,
  value,
  onChange,
  accounts,
  typeFilter,
  disabled,
  inlineCreateAccountType,
  onAccountsRefresh,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dupCandidate, setDupCandidate] = useState<AccountOption | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const accountsForUi = useMemo(
    () =>
      dedupeEntitiesForDisplay(
        accounts.map((a) => ({ ...a }) as unknown as Record<string, unknown>),
        { idKey: "id", entityLabel: "account-combobox" },
      ) as AccountOption[],
    [accounts],
  );

  const typeScoped = useMemo(() => {
    return typeFilter ? accountsForUi.filter((a) => typeFilter(a.type)) : accountsForUi;
  }, [accountsForUi, typeFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = typeScoped;
    if (!q) return base;
    return base.filter(
      (a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q),
    );
  }, [typeScoped, query]);

  const similarWhenNoSubstringMatch = useMemo(() => {
    const q = query.trim();
    if (!q || !inlineCreateAccountType || filtered.length > 0) return [];
    return findSimilarAccountOptions(q, typeScoped, 0.38, 5);
  }, [query, filtered.length, typeScoped, inlineCreateAccountType]);

  const openCreateDialog = () => {
    const initial = query.trim() || "";
    setCreateName(initial);
    setShowAdvanced(false);
    setCreateOpen(true);
  };

  const runCreate = (forceDespiteDuplicate: boolean) => {
    if (!inlineCreateAccountType) return;
    const name = createName.trim();
    if (name.length < 3) {
      toast.error("Account name must be at least 3 characters.");
      return;
    }
    if (!forceDespiteDuplicate) {
      let best: { option: AccountOption; score: number } | null = null;
      for (const a of typeScoped) {
        const score = accountNameSimilarityScore(name, a.name);
        if (!best || score > best.score) best = { option: a, score };
      }
      if (best && best.score >= DUPLICATE_WARNING_SCORE) {
        setDupCandidate(best.option);
        setDupOpen(true);
        return;
      }
    }

    startTransition(async () => {
      try {
        const { autoCreateAccountAction } = await import("@/lib/actions/accounts");
        const row = await autoCreateAccountAction(name, inlineCreateAccountType);
        const opt: AccountOption = {
          id: row.id,
          name: row.name,
          code: row.code,
          type: row.type,
        };
        onChange(opt);
        setOpen(false);
        setQuery("");
        setCreateOpen(false);
        setDupOpen(false);
        setDupCandidate(null);
        await onAccountsRefresh?.();
        toast.success(`Account “${row.name}” created`);
      } catch (e) {
        toast.error(getErrorMessage(e, "Could not create account."));
      }
    });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value ? `${value.code} — ${value.name}` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="border-b p-2">
            <Input
              placeholder="Search accounts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length > 0 ? (
              filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                    value?.id === a.id && "bg-accent",
                  )}
                  onClick={() => {
                    onChange(a);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className={cn("h-4 w-4", value?.id === a.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">
                    {a.code} — {a.name}
                  </span>
                </button>
              ))
            ) : query.trim() ? (
              <div className="space-y-2 px-2 py-2">
                {similarWhenNoSubstringMatch.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Similar accounts</p>
                    {similarWhenNoSubstringMatch.map(({ option: a, score }) => (
                      <button
                        key={a.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                          value?.id === a.id && "bg-accent",
                        )}
                        onClick={() => {
                          onChange(a);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        <Check className={cn("h-4 w-4", value?.id === a.id ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">
                          {a.code} — {a.name}
                          <span className="ml-1 text-xs text-muted-foreground">({Math.round(score * 100)}% match)</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="text-sm text-muted-foreground">No accounts match “{query.trim()}”.</p>
                {inlineCreateAccountType ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      openCreateDialog();
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Create “{query.trim()}”
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Add the account under Chart of Accounts, or refresh.</p>
                )}
              </div>
            ) : (
              <p className="px-2 py-3 text-sm text-muted-foreground">Type to search or create.</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Create{" "}
              {inlineCreateAccountType === "expense"
                ? "expense"
                : inlineCreateAccountType === "asset"
                  ? "asset"
                  : inlineCreateAccountType === "revenue"
                    ? "revenue"
                    : inlineCreateAccountType === "liability"
                      ? "liability"
                      : inlineCreateAccountType === "equity"
                        ? "equity"
                        : ""}{" "}
              account
            </DialogTitle>
            <DialogDescription>
              Account code is generated automatically.{" "}
              {inlineCreateAccountType ? defaultClassificationHint(inlineCreateAccountType) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="inline-acc-name">Name</Label>
              <Input
                id="inline-acc-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Freight"
                autoFocus
              />
            </div>
            {inlineCreateAccountType ? (
              <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
                <span className="font-medium text-foreground">Type:</span>{" "}
                <span className="capitalize">{inlineCreateAccountType}</span>
                {" · "}
                <span className="font-medium text-foreground">Defaults:</span>{" "}
                {defaultClassificationHint(inlineCreateAccountType)}
              </p>
            ) : null}
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide advanced" : "Advanced"}
            </button>
            {showAdvanced ? (
              <p className="text-xs text-muted-foreground">
                To use a custom code or sub-type, open Chart of Accounts after creating this account.
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending || createName.trim().length < 3} onClick={() => runCreate(false)}>
              {pending ? "Creating…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Similar account already exists</DialogTitle>
            <DialogDescription>
              {dupCandidate ? (
                <>
                  “{dupCandidate.name}” ({dupCandidate.code}) looks like the same category. Use the existing account
                  to avoid duplicates.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="default"
              className="w-full sm:w-auto"
              onClick={() => {
                if (dupCandidate) {
                  onChange(dupCandidate);
                  setOpen(false);
                  setQuery("");
                  setCreateOpen(false);
                  setDupOpen(false);
                  setDupCandidate(null);
                }
              }}
            >
              Use existing
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setDupOpen(false);
                setDupCandidate(null);
                runCreate(true);
              }}
              disabled={pending}
            >
              Create anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

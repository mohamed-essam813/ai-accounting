"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { dedupeEntitiesForDisplay } from "@/lib/utils/entity-dedupe";

export type AccountOption = { id: string; name: string; code: string; type: string };

type Props = {
  id?: string;
  label: string;
  placeholder: string;
  value: AccountOption | null;
  onChange: (acc: AccountOption | null) => void;
  accounts: AccountOption[];
  typeFilter?: (t: string) => boolean;
  disabled?: boolean;
};

export function AccountCombobox({
  id,
  label,
  placeholder,
  value,
  onChange,
  accounts,
  typeFilter,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const accountsForUi = useMemo(
    () =>
      dedupeEntitiesForDisplay(
        accounts.map((a) => ({ ...a }) as unknown as Record<string, unknown>),
        { idKey: "id", entityLabel: "account-combobox" },
      ) as AccountOption[],
    [accounts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = typeFilter ? accountsForUi.filter((a) => typeFilter(a.type)) : accountsForUi;
    if (!q) return base;
    return base.filter(
      (a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q),
    );
  }, [accountsForUi, query, typeFilter]);

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
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No accounts found.</p>
            ) : (
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
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}


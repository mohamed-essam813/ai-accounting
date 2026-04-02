"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type BankOption = { id: string; name: string; code: string };

type Props = {
  id?: string;
  label: string;
  placeholder: string;
  value: BankOption | null;
  onChange: (bank: BankOption | null) => void;
  banks: BankOption[];
  disabled?: boolean;
};

export function BankAccountCombobox({
  id,
  label,
  placeholder,
  value,
  onChange,
  banks,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q),
    );
  }, [banks, query]);

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
              placeholder="Search bank accounts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                No bank accounts found. Add a bank account under Chart of Accounts (subtype Bank).
              </p>
            ) : (
              filtered.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                    value?.id === b.id && "bg-accent",
                  )}
                  onClick={() => {
                    onChange(b);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className={cn("h-4 w-4", value?.id === b.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">
                    {b.code} — {b.name}
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

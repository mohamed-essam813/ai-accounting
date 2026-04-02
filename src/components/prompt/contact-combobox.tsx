"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { createContactFromPickerAction } from "@/lib/actions/guided-drafts";
import { toast } from "sonner";

export type ContactOption = { id: string; name: string; type: string };

type Props = {
  id?: string;
  label: string;
  placeholder: string;
  value: ContactOption | null;
  onChange: (contact: ContactOption | null) => void;
  contacts: ContactOption[];
  kind: "customer" | "vendor";
  onContactsRefresh: () => Promise<void>;
  disabled?: boolean;
};

export function ContactCombobox({
  id,
  label,
  placeholder,
  value,
  onChange,
  contacts,
  kind,
  onContactsRefresh,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const roleOk = (c: ContactOption) =>
      kind === "customer" ? c.type === "customer" : c.type === "vendor";
    if (!q) return contacts.filter(roleOk);
    return contacts.filter((c) => c.name.toLowerCase().includes(q) && roleOk(c));
  }, [contacts, query, kind]);

  const exactMatch = useMemo(
    () => contacts.some((c) => c.name.toLowerCase() === query.trim().toLowerCase()),
    [contacts, query],
  );

  const showCreate = query.trim().length > 0 && !exactMatch;

  const handleCreate = async () => {
    const name = query.trim();
    if (!name) return;
    try {
      const row = await createContactFromPickerAction(name, kind);
      toast.success(kind === "customer" ? "Customer added" : "Supplier added");
      await onContactsRefresh();
      onChange({ id: row.id, name: row.name, type: row.type });
      setOpen(false);
      setQuery("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create contact");
    }
  };

  return (
    <div className="space-y-2">
      {label ? (
        <Label htmlFor={id}>{label}</Label>
      ) : null}
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
              {value ? value.name : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="flex flex-col gap-0">
            <div className="border-b p-2">
              <Input
                placeholder="Search or type a new name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && showCreate) {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
              />
            </div>
            <div className="max-h-56 overflow-y-auto p-1">
              {filtered.length === 0 && !showCreate ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">No matches. Type a name to create.</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                      value?.id === c.id && "bg-accent",
                    )}
                    onClick={() => {
                      onChange(c);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check className={cn("h-4 w-4", value?.id === c.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))
              )}
              {showCreate ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-primary hover:bg-accent"
                  onClick={() => void handleCreate()}
                >
                  <UserPlus className="h-4 w-4 shrink-0" />
                  <span>
                    Create new {kind === "customer" ? "customer" : "supplier"}: &quot;{query.trim()}&quot;
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

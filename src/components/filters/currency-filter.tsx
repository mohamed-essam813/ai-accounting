"use client";

/**
 * Currency Filter Component (Searchable)
 *
 * Searchable currency dropdown with type-ahead search.
 * Defaults to baseCurrency when no initialCurrency is provided.
 *
 * Note: This is for currency CONVERSION, not filtering.
 * When a currency is selected, all amounts are converted to that currency for display.
 * All records remain visible regardless of their original currency.
 */

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAllCurrencies } from "@/lib/currencies";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// Currency names for search (common names)
const CURRENCY_NAMES: Record<string, string> = {
  AED: "UAE Dirham",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  SAR: "Saudi Riyal",
  INR: "Indian Rupee",
  PKR: "Pakistani Rupee",
  EGP: "Egyptian Pound",
  // Add more as needed
};

type Props = {
  initialCurrency?: string;
  /** Default = baseCurrency when no initialCurrency. baseCurrency used for conversion when a specific currency is selected. */
  baseCurrency?: string;
  /** Optional override. When empty (default), dropdown shows ALL supported currencies (ISO 4217 / FX providers). */
  currencies?: string[];
};

export function CurrencyFilter({ initialCurrency, baseCurrency = "USD", currencies = [] }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Default to baseCurrency when no initialCurrency (instead of "all")
  const effectiveValue = initialCurrency ?? baseCurrency;

  // When custom list provided (e.g. drafts: currencies from data), use it + base. Otherwise show ALL available.
  const availableCurrencies =
    currencies.length > 0
      ? Array.from(new Set([baseCurrency, ...currencies])).sort()
      : getAllCurrencies();

  // Filter currencies based on search (code or name)
  const filteredCurrencies = useMemo(() => {
    if (!search.trim()) return availableCurrencies;
    const searchLower = search.toLowerCase();
    return availableCurrencies.filter((code) => {
      const codeMatch = code.toLowerCase().includes(searchLower);
      const nameMatch = CURRENCY_NAMES[code]?.toLowerCase().includes(searchLower);
      return codeMatch || nameMatch;
    });
  }, [availableCurrencies, search]);

  const handleCurrencyChange = (currency: string) => {
    setOpen(false);
    setSearch("");
    const params = new URLSearchParams(searchParams.toString());
    if (currency && currency !== "all") {
      params.set("currency", currency);
    } else if (currency === "all") {
      params.set("currency", "all");
    } else {
      params.delete("currency");
    }
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  };

  const displayValue = effectiveValue === "all" ? "All Currencies" : effectiveValue;
  const displayName = effectiveValue !== "all" && CURRENCY_NAMES[effectiveValue]
    ? `${effectiveValue} – ${CURRENCY_NAMES[effectiveValue]}`
    : displayValue;

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="currency-filter" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
        Currency:
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="currency-filter"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="min-w-[180px] h-9 justify-between"
            disabled={isPending}
          >
            <span className="truncate">{displayName}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder="Search currency (e.g., AED, Dirham, USD)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <div className="max-h-[300px] overflow-auto p-1">
            <button
              type="button"
              onClick={() => handleCurrencyChange("all")}
              className={cn(
                "w-full flex items-center justify-between rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
                effectiveValue === "all" && "bg-accent"
              )}
            >
              <span>All Currencies</span>
              {effectiveValue === "all" && <Check className="h-4 w-4" />}
            </button>
            {filteredCurrencies.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                No currencies found.
              </div>
            ) : (
              filteredCurrencies.map((code) => {
                const name = CURRENCY_NAMES[code];
                const label = name ? `${code} – ${name}` : code;
                const isSelected = effectiveValue === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleCurrencyChange(code)}
                    className={cn(
                      "w-full flex items-center justify-between rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
                      isSelected && "bg-accent"
                    )}
                  >
                    <span>{label}</span>
                    {isSelected && <Check className="h-4 w-4" />}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

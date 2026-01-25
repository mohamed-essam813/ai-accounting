"use client";

/**
 * Currency Filter Component
 *
 * Note: This is for currency CONVERSION, not filtering.
 * When a currency is selected, all amounts are converted to that currency for display.
 * All records remain visible regardless of their original currency.
 */

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useTransition } from "react";
import { getAllCurrencies } from "@/lib/currencies";

type Props = {
  initialCurrency?: string;
  /** Default = "All Currencies" when no selection. baseCurrency used for conversion when a specific currency is selected. */
  baseCurrency?: string;
  /** Optional override. When empty (default), dropdown shows ALL supported currencies (ISO 4217 / FX providers). */
  currencies?: string[];
};

export function CurrencyFilter({ initialCurrency, baseCurrency = "USD", currencies = [] }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleCurrencyChange = (currency: string) => {
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

  // Default = "All Currencies" on all pages. Explicit selection overrides.
  const effectiveValue = initialCurrency ?? "all";

  // When custom list provided (e.g. drafts: currencies from data), use it + base. Otherwise show ALL available.
  const availableCurrencies =
    currencies.length > 0
      ? Array.from(new Set([baseCurrency, ...currencies])).sort()
      : getAllCurrencies();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="currency-filter" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
        Currency:
      </Label>
      <Select
        value={effectiveValue}
        onValueChange={handleCurrencyChange}
        disabled={isPending}
      >
        <SelectTrigger id="currency-filter" className="min-w-[140px] h-9">
          <SelectValue placeholder="All Currencies" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Currencies</SelectItem>
          {availableCurrencies.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

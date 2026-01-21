"use client";

/**
 * Currency Filter Component
 * 
 * Note: This is for currency CONVERSION, not filtering.
 * When a currency is selected, all amounts are converted to that currency for display.
 * All records remain visible regardless of their original currency.
 */

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useTransition } from "react";

type Props = {
  initialCurrency?: string;
  currencies?: string[]; // Available currencies (from data)
};

export function CurrencyFilter({ initialCurrency, currencies = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleCurrencyChange = (currency: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (currency && currency !== "all") {
        params.set("currency", currency);
      } else {
        params.delete("currency");
      }
      router.push(`?${params.toString()}`);
    });
  };

  // Common currencies for fallback if none provided
  const commonCurrencies = ["AED", "USD", "EUR", "GBP", "SAR", "INR", "PKR"];
  const availableCurrencies = currencies.length > 0 ? currencies : commonCurrencies;

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="currency-filter" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
        Currency:
      </Label>
      <Select
        value={initialCurrency || "all"}
        onValueChange={handleCurrencyChange}
        disabled={isPending}
      >
        <SelectTrigger id="currency-filter" className="min-w-[140px] h-9">
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Currencies</SelectItem>
          {availableCurrencies.map((currency) => (
            <SelectItem key={currency} value={currency}>
              {currency}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Currency Conversion Utilities
 * Converts values between currencies using FX rates
 * 
 * Fixes bug: Currency selector was filtering records instead of converting values
 * Correct behavior: Currency switch = presentation layer conversion, NOT data filtering
 */

import { createServiceSupabaseClient } from "@/lib/supabase/service";

type FXRate = {
  from_currency: string;
  to_currency: string;
  rate: number;
  date: string;
};

/**
 * Get FX rate for conversion
 * Checks database first, then fetches on-demand if not found
 * Falls back to 1:1 only if fetch fails
 */
export async function getFXRate(
  fromCurrency: string,
  toCurrency: string,
  date: string,
  tenantId: string,
  fetchIfMissing: boolean = true,
): Promise<number> {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return 1.0;
  }

  // Check if rate exists in database
  const supabase = createServiceSupabaseClient();

  const { data: rate } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("fx_rates" as never)
    .select("rate")
    .eq("from_currency", fromCurrency.toUpperCase())
    .eq("to_currency", toCurrency.toUpperCase())
    .eq("tenant_id", tenantId)
    .lte("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rate && typeof rate === "object" && "rate" in rate && typeof (rate as { rate: unknown }).rate === "number") {
    return Number((rate as { rate: number }).rate);
  }

  // If rate not found and fetchIfMissing is true, try to fetch it
  if (fetchIfMissing) {
    try {
      const { fetchAndStoreFXRates } = await import("@/lib/services/fx-rates");
      const { getRecommendedProvider } = await import("@/lib/services/fx-rates");
      
      // Fetch rates for today (or specified date)
      const provider = getRecommendedProvider();
      await fetchAndStoreFXRates(tenantId, fromCurrency, provider, date);
      
      // Try to get the rate again
      const { data: newRate } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("fx_rates" as never)
        .select("rate")
        .eq("from_currency", fromCurrency.toUpperCase())
        .eq("to_currency", toCurrency.toUpperCase())
        .eq("tenant_id", tenantId)
        .eq("date", date)
        .maybeSingle();

      if (newRate && typeof newRate === "object" && "rate" in newRate && typeof (newRate as { rate: unknown }).rate === "number") {
        return Number((newRate as { rate: number }).rate);
      }
    } catch (error) {
      console.warn(
        `Failed to fetch FX rate for ${fromCurrency} -> ${toCurrency}:`,
        error,
      );
    }
  }

  // Final fallback: Use 1:1 (should not happen in production with proper setup)
  console.warn(
    `FX rate not found for ${fromCurrency} -> ${toCurrency} on ${date}. Using 1:1.`,
  );
  return 1.0;
}

/**
 * Convert amount from one currency to another
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string,
  tenantId: string,
): Promise<number> {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return amount;
  }

  const rate = await getFXRate(fromCurrency, toCurrency, date, tenantId);
  return amount * rate;
}

/**
 * Convert multiple values (for batch conversion)
 */
export async function convertCurrencyBatch(
  amounts: Array<{ value: number; currency: string; date: string }>,
  toCurrency: string,
  tenantId: string,
): Promise<number[]> {
  const conversions = await Promise.all(
    amounts.map(({ value, currency, date }) =>
      convertCurrency(value, currency, toCurrency, date, tenantId),
    ),
  );
  return conversions;
}

/**
 * Get base currency for tenant
 * TODO: Fetch from tenant settings
 */
export async function getTenantBaseCurrency(tenantId: string): Promise<string> {
  // For MVP, default to USD
  // TODO: Fetch from tenant settings table
  return "USD";
}

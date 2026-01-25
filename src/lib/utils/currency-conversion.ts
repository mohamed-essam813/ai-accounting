/**
 * Currency Conversion Utilities
 * Converts values between currencies using FX rates
 *
 * Fixes bug: Currency selector was filtering records instead of converting values
 * Correct behavior: Currency switch = presentation layer conversion, NOT data filtering
 */

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { isSupportedCurrency, normaliseCurrencyCode } from "@/lib/currencies";

/** Free FX APIs return only latest rates. We fetch/store/lookup by today so we use what we fetch. */
function getFXDate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Get FX rate for conversion.
 * Checks database first, then fetches on-demand if not found.
 * Uses latest (today) for fetch/lookup: free APIs don't support historical dates.
 * Falls back to 1:1 if currency unsupported or fetch fails.
 */
export async function getFXRate(
  fromCurrency: string,
  toCurrency: string,
  _date: string,
  tenantId: string,
  fetchIfMissing: boolean = true,
): Promise<number> {
  const from = normaliseCurrencyCode(fromCurrency);
  const to = normaliseCurrencyCode(toCurrency);

  if (from === to) {
    return 1.0;
  }

  if (!isSupportedCurrency(from) || !isSupportedCurrency(to)) {
    console.warn(
      `FX: Unsupported currency (${fromCurrency} -> ${toCurrency}). ` +
        `Use ISO 4217 codes (e.g. AED, USD). Common typo: ATD -> AED. Using 1:1.`,
    );
    return 1.0;
  }

  const fxDate = getFXDate();
  const supabase = createServiceSupabaseClient();

  const { data: rate } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("fx_rates" as never)
    .select("rate")
    .eq("from_currency", from)
    .eq("to_currency", to)
    .eq("tenant_id", tenantId)
    .lte("date", fxDate)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rate && typeof rate === "object" && "rate" in rate && typeof (rate as { rate: unknown }).rate === "number") {
    return Number((rate as { rate: number }).rate);
  }

  if (fetchIfMissing) {
    try {
      const { fetchAndStoreFXRates, getRecommendedProvider } = await import(
        "@/lib/services/fx-rates"
      );
      const provider = getRecommendedProvider();
      await fetchAndStoreFXRates(tenantId, from, provider, fxDate, [to]);

      const { data: newRate } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("fx_rates" as never)
        .select("rate")
        .eq("from_currency", from)
        .eq("to_currency", to)
        .eq("tenant_id", tenantId)
        .eq("date", fxDate)
        .maybeSingle();

      if (newRate && typeof newRate === "object" && "rate" in newRate && typeof (newRate as { rate: unknown }).rate === "number") {
        return Number((newRate as { rate: number }).rate);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `FX fetch failed for ${from} -> ${to}: ${msg}. Using 1:1.`,
      );
    }
  }

  console.warn(
    `FX rate not found for ${from} -> ${to}. Using 1:1.`,
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

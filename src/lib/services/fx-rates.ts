/**
 * FX Rate Fetching Service
 * Fetches latest exchange rates from external APIs and stores them in database
 * 
 * Supports multiple providers:
 * - ExchangeRate-API (free tier: 1,500 requests/month)
 * - Fixer.io (paid, more reliable)
 * - CurrencyAPI (free tier available)
 * 
 * Rates are updated:
 * - On-demand when needed (if not in DB)
 * - Via scheduled cron job (daily)
 * - Via API endpoint (manual trigger)
 */

import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { isSupportedCurrency, normaliseCurrencyCode } from "@/lib/currencies";

// Access env vars directly since they're optional
const getEnvVar = (key: string): string | undefined => {
  if (typeof window !== "undefined") return undefined;
  return process.env[key];
};

type FXRateProvider = "exchangerate-api" | "fixer" | "currencyapi" | "manual";

interface FXRateResponse {
  success: boolean;
  rates: Record<string, number>;
  base: string;
  date: string;
  error?: string;
}

/**
 * Fetch rates from ExchangeRate-API (free tier)
 * Free: 1,500 requests/month, no API key needed for basic usage
 * Docs: https://www.exchangerate-api.com/docs/free
 * When no key (v4): returns ALL rates for base. We use all so conversion works for any dropdown selection.
 */
async function fetchFromExchangeRateAPI(
  baseCurrency: string,
  targetCurrencies: string[],
  useAllRates = false,
): Promise<FXRateResponse> {
  const apiKey = getEnvVar("EXCHANGERATE_API_KEY");
  const url = apiKey
    ? `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${baseCurrency}`
    : `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ExchangeRate-API failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (data && data.result === "error") {
    const errType = data["error-type"] || "unknown";
    throw new Error(
      `ExchangeRate-API: ${errType} (base: ${baseCurrency}). Use ISO 4217 codes (e.g. AED, USD).`,
    );
  }

  const rates: Record<string, number> = {};
  const source = data.rates && typeof data.rates === "object" ? data.rates : {};

  if (useAllRates || targetCurrencies.length === 0) {
    // Store all rates (free tier / full dropdown support)
    for (const [currency, value] of Object.entries(source)) {
      if (currency !== baseCurrency && typeof value === "number") {
        rates[currency] = value;
      }
    }
  } else {
    for (const currency of targetCurrencies) {
      if (source[currency] != null) {
        rates[currency] = Number(source[currency]);
      }
    }
  }

  return {
    success: true,
    rates,
    base: baseCurrency,
    date: data.date || new Date().toISOString().split("T")[0],
  };
}

/**
 * Fetch rates from Fixer.io (paid, more reliable)
 * Requires API key
 * Docs: https://fixer.io/documentation
 */
async function fetchFromFixer(
  baseCurrency: string,
  targetCurrencies: string[],
): Promise<FXRateResponse> {
  const apiKey = getEnvVar("FIXER_API_KEY");
  if (!apiKey) {
    throw new Error("FIXER_API_KEY not configured");
  }

  const symbols = targetCurrencies.join(",");
  const url = `https://api.fixer.io/latest?access_key=${apiKey}&base=${baseCurrency}&symbols=${symbols}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fixer.io failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error?.info || "Fixer.io API error");
  }

  return {
    success: true,
    rates: data.rates || {},
    base: baseCurrency,
    date: data.date || new Date().toISOString().split("T")[0],
  };
}

/**
 * Fetch rates from CurrencyAPI (free tier available)
 * Free: 300 requests/month
 * Docs: https://currencyapi.com/docs
 */
async function fetchFromCurrencyAPI(
  baseCurrency: string,
  targetCurrencies: string[],
): Promise<FXRateResponse> {
  const apiKey = getEnvVar("CURRENCYAPI_KEY");
  if (!apiKey) {
    throw new Error("CURRENCYAPI_KEY not configured");
  }

  const currencies = targetCurrencies.join(",");
  const url = `https://api.currencyapi.com/v3/latest?apikey=${apiKey}&base_currency=${baseCurrency}&currencies=${currencies}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CurrencyAPI failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  // Transform CurrencyAPI response format
  const rates: Record<string, number> = {};
  if (data.data) {
    for (const [currency, info] of Object.entries(data.data) as [string, any][]) {
      rates[currency] = info.value;
    }
  }

  return {
    success: true,
    rates,
    base: baseCurrency,
    date: data.meta?.last_updated_at?.split("T")[0] || new Date().toISOString().split("T")[0],
  };
}

/**
 * Get list of currencies used by tenant (from transactions)
 */
async function getTenantCurrencies(tenantId: string): Promise<string[]> {
  const supabase = createServiceSupabaseClient();
  
  // Get unique currencies from journal entries
  const { data: entries } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("journal_entries" as never)
    .select("transaction_currency, base_currency")
    .eq("tenant_id", tenantId)
    .not("transaction_currency", "is", null);

  const currencies = new Set<string>();
  
  if (entries && Array.isArray(entries)) {
    for (const entry of entries as Array<{ transaction_currency?: string | null; base_currency?: string | null }>) {
      if (entry.transaction_currency) {
        currencies.add(entry.transaction_currency.toUpperCase());
      }
      if (entry.base_currency) {
        currencies.add(entry.base_currency.toUpperCase());
      }
    }
  }

  // Always include common currencies
  const commonCurrencies = ["USD", "EUR", "GBP", "AED", "SAR", "INR", "CNY", "JPY"];
  commonCurrencies.forEach((c) => currencies.add(c));

  return Array.from(currencies);
}

/**
 * Fetch and store FX rates for a tenant
 *
 * @param tenantId - Tenant ID
 * @param baseCurrency - Base currency (default: USD)
 * @param provider - FX rate provider to use
 * @param targetDate - Date for rates (default: today)
 * @param extraCurrencies - Additional currencies to fetch (e.g. user-selected from dropdown). Ensures requested pair is always available.
 */
export async function fetchAndStoreFXRates(
  tenantId: string,
  baseCurrency: string = "USD",
  provider: FXRateProvider = "exchangerate-api",
  targetDate?: string,
  extraCurrencies: string[] = [],
): Promise<{ fetched: number; stored: number; errors: string[] }> {
  const supabase = createServiceSupabaseClient();
  const date = targetDate || new Date().toISOString().split("T")[0];
  const base = normaliseCurrencyCode(baseCurrency);

  if (!isSupportedCurrency(base)) {
    const err = `Unsupported base currency: ${baseCurrency}. Use ISO 4217 (e.g. AED, USD). Common typo: ATD -> AED.`;
    console.warn(`FX: ${err}`);
    return { fetched: 0, stored: 0, errors: [err] };
  }

  const tenantList = await getTenantCurrencies(tenantId);
  const merged = new Set([
    ...tenantList.map((c) => normaliseCurrencyCode(c)),
    ...extraCurrencies.map((c) => normaliseCurrencyCode(c)),
  ]);
  merged.delete(base);

  const currenciesToFetch = Array.from(merged).filter((c) => isSupportedCurrency(c));

  // Free ExchangeRate-API (no key): fetch all rates so any dropdown selection has a rate
  const useAllRates =
    provider === "exchangerate-api" && !getEnvVar("EXCHANGERATE_API_KEY");
  if (!useAllRates && currenciesToFetch.length === 0) {
    return { fetched: 0, stored: 0, errors: [] };
  }

  let rateData: FXRateResponse;
  const errors: string[] = [];

  try {
    switch (provider) {
      case "exchangerate-api":
        rateData = await fetchFromExchangeRateAPI(
          base,
          currenciesToFetch,
          useAllRates,
        );
        break;
      case "fixer":
        rateData = await fetchFromFixer(base, currenciesToFetch);
        break;
      case "currencyapi":
        rateData = await fetchFromCurrencyAPI(base, currenciesToFetch);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    if (!rateData.success || !rateData.rates) {
      throw new Error("Failed to fetch rates from provider");
    }

    const rateDate = rateData.date || date;
    const ratesToStore = Object.entries(rateData.rates).map(([currency, rate]) => ({
      tenant_id: tenantId,
      from_currency: base,
      to_currency: currency.toUpperCase(),
      rate: Number(rate),
      date: rateDate,
    }));

    const reverseRates = Object.entries(rateData.rates).map(([currency, rate]) => ({
      tenant_id: tenantId,
      from_currency: currency.toUpperCase(),
      to_currency: base,
      rate: 1 / Number(rate),
      date: rateDate,
    }));

    const allRates = [...ratesToStore, ...reverseRates];

    // Upsert rates (update if exists, insert if not)
    const { error: upsertError } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("fx_rates" as never)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(allRates as any, {
        onConflict: "tenant_id,from_currency,to_currency,date",
      });

    if (upsertError) {
      throw upsertError;
    }

    return {
      fetched: Object.keys(rateData.rates).length,
      stored: allRates.length,
      errors: [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);
    console.error(
      `FX: Failed to fetch/store rates for tenant ${tenantId} (base: ${base}):`,
      errorMessage,
    );
    return {
      fetched: 0,
      stored: 0,
      errors: [errorMessage],
    };
  }
}

/**
 * Fetch rates for all tenants (for scheduled jobs)
 */
export async function fetchFXRatesForAllTenants(
  provider: FXRateProvider = "exchangerate-api",
): Promise<void> {
  const supabase = createServiceSupabaseClient();
  
  // Get all active tenants
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id");

  if (!tenants || tenants.length === 0) {
    return;
  }

  // Fetch rates for each tenant
  for (const tenant of tenants) {
    try {
      await fetchAndStoreFXRates(tenant.id, "USD", provider);
      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to fetch rates for tenant ${tenant.id}:`, error);
    }
  }
}

/**
 * Get recommended provider based on available API keys
 */
export function getRecommendedProvider(): FXRateProvider {
  if (getEnvVar("FIXER_API_KEY")) {
    return "fixer"; // Most reliable if available
  }
  if (getEnvVar("CURRENCYAPI_KEY")) {
    return "currencyapi";
  }
  return "exchangerate-api"; // Free, no key needed
}

/**
 * ISO 4217 currency codes supported by major FX providers (e.g. ExchangeRate-API).
 * Used for the currency conversion dropdown so users can select any available currency.
 */

export const ALL_CURRENCY_CODES: readonly string[] = [
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL",
  "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLF", "CLP",
  "CNH", "CNY", "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP",
  "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "FOK", "GBP", "GEL",
  "GGP", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK",
  "HTG", "HUF", "IDR", "ILS", "IMP", "INR", "IQD", "IRR", "ISK", "JEP",
  "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KID", "KMF", "KRW", "KWD",
  "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL",
  "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN",
  "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB",
  "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB",
  "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SLL",
  "SOS", "SRD", "SSP", "STN", "SYP", "SZL", "THB", "TJS", "TMT", "TND",
  "TOP", "TRY", "TTD", "TVD", "TWD", "TZS", "UAH", "UGX", "USD", "UYU",
  "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XCG", "XDR", "XOF",
  "XPF", "YER", "ZAR", "ZMW", "ZWG", "ZWL",
] as const;

export type CurrencyCode = (typeof ALL_CURRENCY_CODES)[number];

/** Set of all codes for O(1) lookup. */
const CODES_SET = new Set<string>(ALL_CURRENCY_CODES);

export function isSupportedCurrency(code: string): boolean {
  return CODES_SET.has(code.toUpperCase());
}

/** Common typos → ISO 4217. Used before fetch so invalid codes don't break FX. */
const CURRENCY_TYPOS: Record<string, string> = {
  ATD: "AED",
  ALD: "AED",
};

/**
 * Normalise currency code: fix typos, uppercase. Returns original if no mapping.
 */
export function normaliseCurrencyCode(code: string): string {
  const u = code?.trim().toUpperCase() || "";
  return CURRENCY_TYPOS[u] ?? u;
}

/**
 * List of all available currencies for dropdowns.
 * Sorted alphabetically; use with baseCurrency to promote base first if desired.
 */
export function getAllCurrencies(): string[] {
  return [...ALL_CURRENCY_CODES].sort((a, b) => a.localeCompare(b));
}

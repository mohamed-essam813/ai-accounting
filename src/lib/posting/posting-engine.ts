/**
 * Pure posting helpers: business amounts → net / tax / gross.
 * Journal line construction for invoices/bills stays in buildDefaultJournalLines + postDraft;
 * this module centralizes tax math for tests and future post_invoice/post_bill services.
 */

export type TaxTreatment = "exclusive" | "inclusive";

export type ComputedLineAmounts = {
  gross: number;
  net: number;
  tax: number;
};

/**
 * @param enteredAmount - user-entered figure (exclusive = net before tax, inclusive = tax-included total)
 * @param taxRatePercent - 0–100 from configured tax code (not user-typed)
 */
export function computeVatFromRate(
  enteredAmount: number,
  taxRatePercent: number,
  treatment: TaxTreatment,
): ComputedLineAmounts {
  const rate = taxRatePercent / 100;
  if (rate <= 0) {
    const v = round2(enteredAmount);
    return { gross: v, net: v, tax: 0 };
  }
  if (treatment === "exclusive") {
    const net = round2(enteredAmount);
    const tax = round2(net * rate);
    return { gross: round2(net + tax), net, tax };
  }
  const gross = round2(enteredAmount);
  const net = round2(gross / (1 + rate));
  const tax = round2(gross - net);
  return { gross, net, tax };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isBalanced(debits: number[], credits: number[]): boolean {
  const d = round2(debits.reduce((a, b) => a + b, 0));
  const c = round2(credits.reduce((a, b) => a + b, 0));
  return d === c;
}

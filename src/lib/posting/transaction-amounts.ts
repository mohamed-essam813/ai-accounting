import { computeVatFromRate, type TaxTreatment } from "@/lib/posting/posting-engine";

export type TransactionAmounts = {
  entered_amount: number;
  tax_rate: number;
  tax_treatment: TaxTreatment;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
};

export function buildTransactionAmounts(params: {
  entered_amount: number;
  tax_rate: number;
  tax_treatment: TaxTreatment;
}): TransactionAmounts {
  const { entered_amount, tax_rate, tax_treatment } = params;
  const cmp = computeVatFromRate(entered_amount, tax_rate, tax_treatment);
  return {
    entered_amount,
    tax_rate,
    tax_treatment,
    subtotal_amount: cmp.net,
    tax_amount: cmp.tax,
    total_amount: cmp.gross,
  };
}

export function validateTransactionAmountsMatch(
  expected: TransactionAmounts,
  provided: TransactionAmounts | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!provided) {
    return { ok: false, error: "Tax calculation mismatch. Please review tax treatment." };
  }
  const keys: Array<keyof TransactionAmounts> = [
    "entered_amount",
    "tax_rate",
    "tax_treatment",
    "subtotal_amount",
    "tax_amount",
    "total_amount",
  ];
  for (const k of keys) {
    if (provided[k] !== expected[k]) {
      return { ok: false, error: "Tax calculation mismatch. Please review tax treatment." };
    }
  }
  return { ok: true };
}


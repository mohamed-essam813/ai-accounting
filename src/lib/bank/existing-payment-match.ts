import { normalizeEntityName } from "@/lib/utils/entity-dedupe";

/** Default date window (days) for “nearby date” matching. */
export const BANK_PAYMENT_MATCH_DATE_TOLERANCE_DAYS = 7;

export type PaymentRowForMatch = {
  id: string;
  journal_entry_id: string;
  bank_account_id: string | null;
  amount: number;
  payment_date: string;
  payment_type: string;
  contact_id: string | null;
  reference: string | null;
  voucher_number: string | null;
};

export type BankTxnForMatch = {
  id: string;
  date: string;
  amount: number;
  bank_account_id: string | null;
  counterparty: string | null;
  description?: string;
};

/** Lower score = better match (per spec ranking tiers). */
export function scorePaymentAgainstBankTxn(
  txn: BankTxnForMatch,
  payment: PaymentRowForMatch,
  contactDisplayName: string | null,
): { score: number; tier: 1 | 2 | 3 } | null {
  if (!txn.bank_account_id || !payment.bank_account_id) return null;
  if (txn.bank_account_id !== payment.bank_account_id) return null;

  const txnAmt = Number(txn.amount);
  const payAmt = Number(payment.amount);
  if (!Number.isFinite(txnAmt) || !Number.isFinite(payAmt)) return null;
  if (Math.abs(Math.abs(txnAmt) - Math.abs(payAmt)) > 0.005) return null;

  const wantReceipt = txnAmt > 0;
  const isReceipt = payment.payment_type === "receipt";
  if (wantReceipt !== isReceipt) return null;

  const txnDate = txn.date.slice(0, 10);
  const payDate = payment.payment_date.slice(0, 10);
  const dayDiff = Math.abs(daysBetweenIsoDates(txnDate, payDate));
  const sameDay = dayDiff === 0;
  const nearby = dayDiff <= BANK_PAYMENT_MATCH_DATE_TOLERANCE_DAYS;

  const cp = normalizeEntityName(txn.counterparty ?? "");
  const cn = normalizeEntityName(contactDisplayName ?? "");
  const sameContact = cp.length > 0 && cn.length > 0 && cp === cn;

  const ref = (payment.reference ?? "").trim().toLowerCase();
  const desc = (txn.description ?? "").toLowerCase();
  const sameRef =
    ref.length > 0 && (desc.includes(ref) || ref.split(/\s+/).some((w) => w.length > 3 && desc.includes(w)));

  if (!nearby) return null;

  if (sameDay && sameContact) return { score: 1 + (sameRef ? 0 : 0.1), tier: 1 };
  if (sameContact) return { score: 10 + dayDiff * 0.1 + (sameRef ? 0 : 0.5), tier: 2 };
  return { score: 50 + dayDiff * 0.1, tier: 3 };
}

function daysBetweenIsoDates(a: string, b: string): number {
  const da = Date.parse(`${a}T12:00:00`);
  const db = Date.parse(`${b}T12:00:00`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 999;
  return Math.round((da - db) / (24 * 60 * 60 * 1000));
}

export function formatExistingMatchLabel(
  payment: PaymentRowForMatch,
  paymentTypeLabel: "receipt" | "payment",
): string {
  const v = payment.voucher_number?.trim();
  const base = paymentTypeLabel === "receipt" ? "receipt" : "payment";
  return v ? `Match to existing ${base} ${v}` : `Match to existing ${base}`;
}

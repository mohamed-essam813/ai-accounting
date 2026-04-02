import { describe, it, expect } from "vitest";
import { formatExistingMatchLabel, scorePaymentAgainstBankTxn, type PaymentRowForMatch } from "./existing-payment-match";

const basePayment = (over: Partial<PaymentRowForMatch>): PaymentRowForMatch => ({
  id: "p1",
  journal_entry_id: "je1",
  bank_account_id: "bank1",
  amount: 500,
  payment_date: "2026-04-06",
  payment_type: "payment",
  contact_id: "c1",
  reference: "INV-12",
  voucher_number: "PAY-001",
  ...over,
});

describe("scorePaymentAgainstBankTxn", () => {
  it("matches supplier payment (money out) to payment row with same bank, amount, date, contact", () => {
    const txn = {
      id: "t1",
      date: "2026-04-06",
      amount: -500,
      bank_account_id: "bank1",
      counterparty: "Acme Supplies",
      description: "transfer ref INV-12",
    };
    const pay = basePayment({});
    const r = scorePaymentAgainstBankTxn(txn, pay, "Acme Supplies");
    expect(r).not.toBeNull();
    expect(r!.tier).toBe(1);
  });

  it("rejects when payment type direction does not match bank sign", () => {
    const txn = {
      id: "t1",
      date: "2026-04-06",
      amount: -500,
      bank_account_id: "bank1",
      counterparty: "Acme",
      description: "",
    };
    const pay = basePayment({ payment_type: "receipt" });
    expect(scorePaymentAgainstBankTxn(txn, pay, "Acme")).toBeNull();
  });

  it("returns null when dates are more than 7 days apart", () => {
    const txn = {
      id: "t1",
      date: "2026-04-20",
      amount: -500,
      bank_account_id: "bank1",
      counterparty: "Acme",
      description: "",
    };
    const pay = basePayment({ payment_date: "2026-04-01" });
    expect(scorePaymentAgainstBankTxn(txn, pay, "Acme")).toBeNull();
  });
});

describe("formatExistingMatchLabel", () => {
  it("includes voucher number when present", () => {
    const pay = basePayment({});
    expect(formatExistingMatchLabel(pay, "payment")).toContain("PAY-001");
  });
});

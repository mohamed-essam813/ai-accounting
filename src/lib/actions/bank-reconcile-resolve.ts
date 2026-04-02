"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { ensureDefaultAccounts, getAccountByCode, listAccounts } from "@/lib/data/accounts";
import { createJournalEntryAction } from "@/lib/actions/journals";
import { nextDocumentNumber } from "@/lib/utils/document-numbers";
import {
  getSmartSuggestion,
  matchAccountByPreferredName,
} from "@/lib/bank/reconcile-smart-suggest";
import {
  listOpenBillsForReconciliation,
  listOpenInvoicesForReconciliation,
} from "@/lib/data/reconciliation-documents";
import type { Database } from "@/lib/database.types";

type BankTxnRow = Database["public"]["Tables"]["bank_transactions"]["Row"];
type BankTxnUpdate = Database["public"]["Tables"]["bank_transactions"]["Update"];

const TxnIdSchema = z.object({ transactionId: z.string().uuid() });

async function getTxnOrThrow(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  tenantId: string,
  transactionId: string,
): Promise<BankTxnRow> {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Transaction not found.");
  if (data.status !== "unmatched") {
    throw new Error("This transaction is already resolved.");
  }
  return data as BankTxnRow;
}

function bankAccountIdForTxn(txn: BankTxnRow): string {
  if (!txn.bank_account_id) {
    throw new Error(
      "This import is not linked to a bank account. Select a bank account before importing.",
    );
  }
  return txn.bank_account_id;
}

async function markBankTransactionMatched(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  tenantId: string,
  transactionId: string,
  entryId: string,
) {
  const update: BankTxnUpdate = {
    status: "matched",
    matched_entry_id: entryId,
  };
  const { error } = await supabase
    .from("bank_transactions")
    .update(update)
    .eq("id", transactionId)
    .eq("tenant_id", tenantId);
  if (error) throw error;
}

export async function listOpenBillsReconcileAction() {
  return listOpenBillsForReconciliation(200);
}

export async function listOpenInvoicesReconcileAction() {
  return listOpenInvoicesForReconciliation(200);
}

/** Server-side smart hint (same heuristics as client) for tests / future API use. */
export async function getSmartSuggestionAction(input: { description: string; amount: number }) {
  const parsed = z
    .object({ description: z.string(), amount: z.number() })
    .parse(input);
  return getSmartSuggestion(parsed.description, parsed.amount);
}

const ExpenseSchema = z.object({
  transactionId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  memo: z.string().optional(),
});

export async function resolveBankExpenseAction(input: z.infer<typeof ExpenseSchema>) {
  const payload = ExpenseSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");
  await ensureDefaultAccounts(user.tenant.id);

  const supabase = await createServerSupabaseClient();
  const txn = await getTxnOrThrow(supabase, user.tenant.id, payload.transactionId);
  const amt = Number(txn.amount);
  if (amt >= 0) throw new Error("Only money going out can be recorded as an expense this way.");
  const absAmt = Math.abs(amt);
  const bankId = bankAccountIdForTxn(txn);

  const memo = (payload.memo ?? txn.description).trim() || "Bank expense";

  const entryId = await createJournalEntryAction(
    {
      date: txn.date,
      description: memo,
      lines: [
        { account_id: payload.expenseAccountId, debit: absAmt, credit: 0, memo },
        { account_id: bankId, debit: 0, credit: absAmt, memo: "Bank" },
      ],
    },
    { postImmediately: true, sourceModule: "bank_reconcile" },
  );

  await markBankTransactionMatched(supabase, user.tenant.id, payload.transactionId, entryId);
  revalidatePath("/bank");
  return { entryId, message: "Saved as an expense." };
}

const IncomeSchema = z.object({
  transactionId: z.string().uuid(),
  revenueAccountId: z.string().uuid(),
  memo: z.string().optional(),
});

export async function resolveBankIncomeAction(input: z.infer<typeof IncomeSchema>) {
  const payload = IncomeSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");
  await ensureDefaultAccounts(user.tenant.id);

  const supabase = await createServerSupabaseClient();
  const txn = await getTxnOrThrow(supabase, user.tenant.id, payload.transactionId);
  const amt = Number(txn.amount);
  if (amt <= 0) throw new Error("Only money coming in can be recorded as income this way.");
  const bankId = bankAccountIdForTxn(txn);

  const memo = (payload.memo ?? txn.description).trim() || "Bank income";

  const entryId = await createJournalEntryAction(
    {
      date: txn.date,
      description: memo,
      lines: [
        { account_id: bankId, debit: amt, credit: 0, memo: "Bank" },
        { account_id: payload.revenueAccountId, debit: 0, credit: amt, memo },
      ],
    },
    { postImmediately: true, sourceModule: "bank_reconcile" },
  );

  await markBankTransactionMatched(supabase, user.tenant.id, payload.transactionId, entryId);
  revalidatePath("/bank");
  return { entryId, message: "Saved as income." };
}

const TransferSchema = z.object({
  transactionId: z.string().uuid(),
  otherAccountId: z.string().uuid(),
});

export async function resolveBankTransferAction(input: z.infer<typeof TransferSchema>) {
  const payload = TransferSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");
  await ensureDefaultAccounts(user.tenant.id);

  const supabase = await createServerSupabaseClient();
  const txn = await getTxnOrThrow(supabase, user.tenant.id, payload.transactionId);
  const amt = Number(txn.amount);
  const bankId = bankAccountIdForTxn(txn);
  if (payload.otherAccountId === bankId) {
    throw new Error("Choose a different account than this bank account.");
  }

  const memo = txn.description.trim() || "Transfer";

  let entryId: string;
  if (amt < 0) {
    const absAmt = Math.abs(amt);
    entryId = await createJournalEntryAction(
      {
        date: txn.date,
        description: memo,
        lines: [
          { account_id: payload.otherAccountId, debit: absAmt, credit: 0, memo: "Transfer" },
          { account_id: bankId, debit: 0, credit: absAmt, memo: "Bank" },
        ],
      },
      { postImmediately: true, sourceModule: "bank_reconcile" },
    );
  } else {
    entryId = await createJournalEntryAction(
      {
        date: txn.date,
        description: memo,
        lines: [
          { account_id: bankId, debit: amt, credit: 0, memo: "Bank" },
          { account_id: payload.otherAccountId, debit: 0, credit: amt, memo: "Transfer" },
        ],
      },
      { postImmediately: true, sourceModule: "bank_reconcile" },
    );
  }

  await markBankTransactionMatched(supabase, user.tenant.id, payload.transactionId, entryId);
  revalidatePath("/bank");
  return { entryId, message: "Transfer recorded." };
}

const BillPaySchema = z.object({
  transactionId: z.string().uuid(),
  billId: z.string().uuid(),
  amount: z.number().positive(),
});

export async function resolveBankSupplierPaymentAction(input: z.infer<typeof BillPaySchema>) {
  const payload = BillPaySchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");
  await ensureDefaultAccounts(user.tenant.id);

  const supabase = await createServerSupabaseClient();
  const txn = await getTxnOrThrow(supabase, user.tenant.id, payload.transactionId);
  const amt = Number(txn.amount);
  if (amt >= 0) throw new Error("Supplier payments apply to money going out.");
  const payAmount = Math.min(payload.amount, Math.abs(amt));
  if (payAmount <= 0) throw new Error("Enter a valid amount.");

  const bankId = bankAccountIdForTxn(txn);

  const { data: bill, error: bErr } = await supabase
    .from("bills")
    .select("id, supplier_id, outstanding_amount, total_amount")
    .eq("id", payload.billId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();
  if (bErr || !bill) throw new Error("Bill not found.");
  const outstanding = Number(bill.outstanding_amount);
  if (payAmount - outstanding > 0.01) {
    throw new Error("Amount cannot exceed what is still owed on this bill.");
  }

  const ap = await getAccountByCode("2000");
  if (!ap) throw new Error("Accounts Payable (2000) not found. Run chart of accounts setup.");

  const memo = txn.description.trim() || "Supplier payment";

  const entryId = await createJournalEntryAction(
    {
      date: txn.date,
      description: memo,
      lines: [
        { account_id: ap.id, debit: payAmount, credit: 0, memo: "Supplier payment" },
        { account_id: bankId, debit: 0, credit: payAmount, memo: "Bank" },
      ],
    },
    {
      postImmediately: true,
      sourceModule: "bank_reconcile",
      counterpartyContactId: bill.supplier_id,
    },
  );

  const voucherNumber = await nextDocumentNumber({
    tenantId: user.tenant.id,
    documentType: "payment",
    date: txn.date,
  });

  const { data: payRow, error: pErr } = await supabase
    .from("payments")
    .insert({
      tenant_id: user.tenant.id,
      journal_entry_id: entryId,
      contact_id: bill.supplier_id,
      payment_type: "payment",
      voucher_number: voucherNumber,
      bank_account_id: bankId,
      amount: payAmount,
      payment_date: txn.date,
      reference: memo,
    })
    .select("id")
    .maybeSingle();

  if (pErr) throw pErr;
  const paymentId = (payRow as { id?: string } | null)?.id;
  if (paymentId) {
    const pa = supabase.from("payment_allocations") as unknown as {
      insert: (values: unknown[]) => Promise<{ error: unknown }>;
    };
    const { error: aErr } = await pa.insert([
      {
        tenant_id: user.tenant.id,
        payment_id: paymentId,
        bill_id: bill.id,
        allocated_amount: payAmount,
      },
    ]);
    if (aErr) throw aErr;
  }

  await markBankTransactionMatched(supabase, user.tenant.id, payload.transactionId, entryId);
  revalidatePath("/bank");
  return { entryId, message: "Payment applied to your bill." };
}

const InvoiceReceiptSchema = z.object({
  transactionId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
});

export async function resolveBankCustomerReceiptAction(input: z.infer<typeof InvoiceReceiptSchema>) {
  const payload = InvoiceReceiptSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");
  await ensureDefaultAccounts(user.tenant.id);

  const supabase = await createServerSupabaseClient();
  const txn = await getTxnOrThrow(supabase, user.tenant.id, payload.transactionId);
  const amt = Number(txn.amount);
  if (amt <= 0) throw new Error("Customer payments apply to money coming in.");
  const recvAmount = Math.min(payload.amount, amt);
  if (recvAmount <= 0) throw new Error("Enter a valid amount.");

  const bankId = bankAccountIdForTxn(txn);

  const { data: inv, error: iErr } = await supabase
    .from("invoices")
    .select("id, customer_id, outstanding_amount")
    .eq("id", payload.invoiceId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();
  if (iErr || !inv) throw new Error("Invoice not found.");
  const outstanding = Number(inv.outstanding_amount);
  if (recvAmount - outstanding > 0.01) {
    throw new Error("Amount cannot exceed what is still owed on this invoice.");
  }

  const ar = await getAccountByCode("1100");
  if (!ar) throw new Error("Accounts Receivable (1100) not found. Run chart of accounts setup.");

  const memo = txn.description.trim() || "Customer payment";

  const entryId = await createJournalEntryAction(
    {
      date: txn.date,
      description: memo,
      lines: [
        { account_id: bankId, debit: recvAmount, credit: 0, memo: "Bank" },
        { account_id: ar.id, debit: 0, credit: recvAmount, memo: "Customer payment" },
      ],
    },
    {
      postImmediately: true,
      sourceModule: "bank_reconcile",
      counterpartyContactId: inv.customer_id,
    },
  );

  const voucherNumber = await nextDocumentNumber({
    tenantId: user.tenant.id,
    documentType: "receipt",
    date: txn.date,
  });

  const { data: rcRow, error: rErr } = await supabase
    .from("payments")
    .insert({
      tenant_id: user.tenant.id,
      journal_entry_id: entryId,
      contact_id: inv.customer_id,
      payment_type: "receipt",
      voucher_number: voucherNumber,
      bank_account_id: bankId,
      amount: recvAmount,
      payment_date: txn.date,
      reference: memo,
    })
    .select("id")
    .maybeSingle();

  if (rErr) throw rErr;
  const receiptId = (rcRow as { id?: string } | null)?.id;
  if (receiptId) {
    const ra = supabase.from("receipt_allocations") as unknown as {
      insert: (values: unknown[]) => Promise<{ error: unknown }>;
    };
    const { error: aErr } = await ra.insert([
      {
        tenant_id: user.tenant.id,
        receipt_id: receiptId,
        invoice_id: inv.id,
        allocated_amount: recvAmount,
      },
    ]);
    if (aErr) throw aErr;
  }

  await markBankTransactionMatched(supabase, user.tenant.id, payload.transactionId, entryId);
  revalidatePath("/bank");
  return { entryId, message: "Payment applied to your invoice." };
}

/** Expense + default category from smart suggestion (keyword rules). */
export async function resolveBankExpenseFromSuggestionAction(input: { transactionId: string }) {
  const { transactionId } = TxnIdSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");
  await ensureDefaultAccounts(user.tenant.id);

  const supabase = await createServerSupabaseClient();
  const txn = await getTxnOrThrow(supabase, user.tenant.id, transactionId);
  const accounts = await listAccounts();
  const smart = getSmartSuggestion(txn.description, Number(txn.amount));
  const pick = matchAccountByPreferredName(
    accounts.map((a) => ({
      id: a.id,
      name: a.name,
      code: a.code,
      type: a.type,
      is_active: a.is_active,
    })),
    smart.preferredAccountName,
    "expense",
  );
  if (!pick) throw new Error("No expense category found. Add an expense account in Chart of Accounts.");

  return resolveBankExpenseAction({
    transactionId,
    expenseAccountId: pick.id,
    memo: txn.description,
  });
}

const MatchExistingPaymentSchema = z.object({
  transactionId: z.string().uuid(),
  paymentId: z.string().uuid(),
});

/**
 * Link an imported bank line to a payment/receipt already posted from Record Activity (same journal entry).
 * Prevents duplicate cash events when the bank file arrives later.
 */
export async function resolveBankMatchExistingPaymentAction(input: z.infer<typeof MatchExistingPaymentSchema>) {
  const payload = MatchExistingPaymentSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");

  const supabase = await createServerSupabaseClient();
  const txn = await getTxnOrThrow(supabase, user.tenant.id, payload.transactionId);

  const { data: payment, error: pErr } = await supabase
    .from("payments")
    .select(
      "id, journal_entry_id, bank_account_id, amount, payment_type, tenant_id",
    )
    .eq("id", payload.paymentId)
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  if (pErr || !payment) {
    throw new Error("Payment or receipt not found.");
  }

  const bankId = bankAccountIdForTxn(txn);
  if (payment.bank_account_id !== bankId) {
    throw new Error("Bank account does not match this import line.");
  }

  const amt = Number(txn.amount);
  const payAmt = Number(payment.amount);
  if (Math.abs(Math.abs(amt) - Math.abs(payAmt)) > 0.01) {
    throw new Error("Amount does not match.");
  }

  const wantReceipt = amt > 0;
  const isReceipt = payment.payment_type === "receipt";
  if (wantReceipt !== isReceipt) {
    throw new Error("This bank line does not match that receipt or payment type.");
  }

  const { data: otherMatch } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("tenant_id", user.tenant.id)
    .eq("status", "matched")
    .eq("matched_entry_id", payment.journal_entry_id)
    .neq("id", payload.transactionId)
    .maybeSingle();

  if (otherMatch) {
    throw new Error("That receipt or payment is already linked to another bank line.");
  }

  await markBankTransactionMatched(supabase, user.tenant.id, payload.transactionId, payment.journal_entry_id);
  revalidatePath("/bank");
  return {
    entryId: payment.journal_entry_id,
    message: "Linked to the existing receipt/payment in your books.",
  };
}

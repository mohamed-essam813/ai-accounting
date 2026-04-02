"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/format";
import { getSmartSuggestion, matchAccountByPreferredName } from "@/lib/bank/reconcile-smart-suggest";
import {
  resolveBankExpenseAction,
  resolveBankIncomeAction,
  resolveBankTransferAction,
  resolveBankSupplierPaymentAction,
  resolveBankCustomerReceiptAction,
  resolveBankMatchExistingPaymentAction,
  listOpenBillsReconcileAction,
  listOpenInvoicesReconcileAction,
} from "@/lib/actions/bank-reconcile-resolve";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import type { OpenBillRow, OpenInvoiceRow } from "@/lib/data/reconciliation-documents";
import type { ExistingPaymentMatchResult } from "@/lib/data/bank";

export type BankTxn = {
  id: string;
  date: string;
  amount: number;
  description: string;
  counterparty?: string | null;
  status: string;
  matched_entry_id?: string | null;
  bank_account_id?: string | null;
  /** When set, prefer linking the import to this Record Activity payment/receipt (no duplicate JE). */
  existingMatch?: ExistingPaymentMatchResult | null;
};

type AccountOption = { id: string; name: string; code: string; type: string };

type Step =
  | "choose"
  | "expense"
  | "income"
  | "transfer"
  | "supplier"
  | "customer";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: BankTxn | null;
  accounts: AccountOption[];
};

export function ResolveBankTransactionDialog({ open, onOpenChange, transaction, accounts }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("choose");
  const [expenseAccountId, setExpenseAccountId] = useState<string>("");
  const [revenueAccountId, setRevenueAccountId] = useState<string>("");
  const [transferAccountId, setTransferAccountId] = useState<string>("");
  const [bills, setBills] = useState<OpenBillRow[]>([]);
  const [invoices, setInvoices] = useState<OpenInvoiceRow[]>([]);
  const [billId, setBillId] = useState<string>("");
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [billPayAmount, setBillPayAmount] = useState<string>("");
  const [invoiceRecvAmount, setInvoiceRecvAmount] = useState<string>("");

  const smart = useMemo(() => {
    if (!transaction) return null;
    return getSmartSuggestion(transaction.description, transaction.amount);
  }, [transaction]);

  const expenseAccounts = useMemo(
    () => accounts.filter((a) => a.type === "expense").sort((a, b) => a.name.localeCompare(b.name)),
    [accounts],
  );
  const revenueAccounts = useMemo(
    () => accounts.filter((a) => a.type === "revenue").sort((a, b) => a.name.localeCompare(b.name)),
    [accounts],
  );

  const bankAccountId = transaction?.bank_account_id ?? null;
  const transferTargets = useMemo(() => {
    return accounts
      .filter((a) => a.type === "asset" && a.id !== bankAccountId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts, bankAccountId]);

  useEffect(() => {
    if (!open || !transaction) return;
    setStep("choose");
    const sug = getSmartSuggestion(transaction.description, transaction.amount);
    const exp = matchAccountByPreferredName(
      accounts.map((a) => ({ ...a, is_active: true })),
      sug.preferredAccountName,
      "expense",
    );
    const rev = matchAccountByPreferredName(
      accounts.map((a) => ({ ...a, is_active: true })),
      sug.preferredAccountName,
      "revenue",
    );
    const expList = accounts.filter((a) => a.type === "expense");
    const revList = accounts.filter((a) => a.type === "revenue");
    const xferList = accounts
      .filter((a) => a.type === "asset" && a.id !== transaction.bank_account_id)
      .sort((a, b) => a.name.localeCompare(b.name));
    setExpenseAccountId(exp?.id ?? expList[0]?.id ?? "");
    setRevenueAccountId(rev?.id ?? revList[0]?.id ?? "");
    setTransferAccountId(xferList[0]?.id ?? "");
    setBillId("");
    setInvoiceId("");
    const abs = Math.abs(transaction.amount);
    setBillPayAmount(String(abs));
    setInvoiceRecvAmount(String(transaction.amount > 0 ? transaction.amount : abs));
  }, [open, transaction, accounts]);

  useEffect(() => {
    if (!open || step !== "supplier") return;
    let cancelled = false;
    listOpenBillsReconcileAction()
      .then((rows) => {
        if (!cancelled) setBills(rows);
      })
      .catch(() => {
        if (!cancelled) setBills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, step]);

  useEffect(() => {
    if (!open || step !== "customer") return;
    let cancelled = false;
    listOpenInvoicesReconcileAction()
      .then((rows) => {
        if (!cancelled) setInvoices(rows);
      })
      .catch(() => {
        if (!cancelled) setInvoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, step]);

  const outgoing = transaction && transaction.amount < 0;

  const close = () => {
    onOpenChange(false);
  };

  const onSuccess = (entryId: string, message: string) => {
    toast.success(message, {
      action: {
        label: "View details",
        onClick: () => router.push(`/journals?entryId=${entryId}`),
      },
    });
    close();
    router.refresh();
  };

  const run = (fn: () => Promise<{ entryId: string; message: string }>) => {
    startTransition(async () => {
      try {
        const r = await fn();
        onSuccess(r.entryId, r.message);
      } catch (e) {
        toast.error(getErrorMessage(e, "Something went wrong."));
      }
    });
  };

  if (!transaction) return null;

  const absAmount = Math.abs(transaction.amount);
  const selectedBill = bills.find((b) => b.id === billId);
  const selectedInvoice = invoices.find((i) => i.id === invoiceId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What is this transaction?</DialogTitle>
          <DialogDescription className="space-y-1 text-left">
            <span className="block font-medium text-foreground">
              {formatCurrency(transaction.amount)} · {formatDate(transaction.date)}
            </span>
            <span className="line-clamp-3 block text-sm">{transaction.description}</span>
          </DialogDescription>
        </DialogHeader>

        {step === "choose" && (
          <div className="space-y-4">
            {transaction.existingMatch ? (
              <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-3 text-sm space-y-3">
                <div>
                  <span className="text-muted-foreground">Suggested existing match</span>
                  <p className="font-medium text-foreground mt-0.5">{transaction.existingMatch.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This matches a payment or receipt already recorded from Record Activity (same bank account and
                    amount). Link the import to it so your books are not duplicated.
                  </p>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      resolveBankMatchExistingPaymentAction({
                        transactionId: transaction.id,
                        paymentId: transaction.existingMatch!.paymentId,
                      }),
                    )
                  }
                >
                  Match to existing receipt/payment
                </Button>
                <p className="text-xs text-center text-muted-foreground">or pick another option below</p>
              </div>
            ) : null}
            {smart ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Suggested:</span>{" "}
                <span className="font-medium">{smart.inlineLabel}</span>
                {outgoing && smart.primaryKind === "expense" && expenseAccountId ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2 w-full"
                    disabled={pending}
                    onClick={() => setStep("expense")}
                  >
                    Use suggestion
                  </Button>
                ) : null}
                {!outgoing && smart.primaryKind === "income" && revenueAccountId ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2 w-full"
                    disabled={pending}
                    onClick={() => setStep("income")}
                  >
                    Use suggestion
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-2">
              {outgoing ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start text-left h-auto py-3"
                    onClick={() => setStep("expense")}
                    disabled={pending}
                  >
                    <span className="font-medium">Expense</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      Money you spent (fees, payroll, rent, etc.)
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start text-left h-auto py-3"
                    onClick={() => setStep("supplier")}
                    disabled={pending}
                  >
                    <span className="font-medium">Supplier payment</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      Pay an outstanding bill
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start text-left h-auto py-3"
                    onClick={() => setStep("transfer")}
                    disabled={pending}
                  >
                    <span className="font-medium">Transfer</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      Money moved to another account
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start text-left h-auto py-3"
                    onClick={() => setStep("expense")}
                    disabled={pending}
                  >
                    <span className="font-medium">Something else</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      Choose a category yourself
                    </span>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start text-left h-auto py-3"
                    onClick={() => setStep("income")}
                    disabled={pending}
                  >
                    <span className="font-medium">Income</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      Revenue that is not tied to a specific invoice
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start text-left h-auto py-3"
                    onClick={() => setStep("customer")}
                    disabled={pending}
                  >
                    <span className="font-medium">Customer payment</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      Match to an unpaid invoice
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start text-left h-auto py-3"
                    onClick={() => setStep("transfer")}
                    disabled={pending}
                  >
                    <span className="font-medium">Transfer</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      Money moved from another account
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start text-left h-auto py-3"
                    onClick={() => setStep("income")}
                    disabled={pending}
                  >
                    <span className="font-medium">Something else</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      Choose a category yourself
                    </span>
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {step === "expense" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={expenseAccountId} onValueChange={setExpenseAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                We will record this using the description from your bank ({transaction.description.slice(0, 80)}
                {transaction.description.length > 80 ? "…" : ""}).
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setStep("choose")} disabled={pending}>
                Back
              </Button>
              <Button
                type="button"
                disabled={pending || !expenseAccountId}
                onClick={() =>
                  run(() =>
                    resolveBankExpenseAction({
                      transactionId: transaction.id,
                      expenseAccountId,
                      memo: transaction.description,
                    }),
                  )
                }
              >
                Confirm
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "income" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={revenueAccountId} onValueChange={setRevenueAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent>
                  {revenueAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setStep("choose")} disabled={pending}>
                Back
              </Button>
              <Button
                type="button"
                disabled={pending || !revenueAccountId}
                onClick={() =>
                  run(() =>
                    resolveBankIncomeAction({
                      transactionId: transaction.id,
                      revenueAccountId,
                      memo: transaction.description,
                    }),
                  )
                }
              >
                Confirm
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "transfer" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{outgoing ? "Move money to" : "Money came from"}</Label>
              <Select value={transferAccountId} onValueChange={setTransferAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose account" />
                </SelectTrigger>
                <SelectContent>
                  {transferTargets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setStep("choose")} disabled={pending}>
                Back
              </Button>
              <Button
                type="button"
                disabled={pending || !transferAccountId}
                onClick={() =>
                  run(() =>
                    resolveBankTransferAction({
                      transactionId: transaction.id,
                      otherAccountId: transferAccountId,
                    }),
                  )
                }
              >
                Confirm
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "supplier" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bill</Label>
              <Select
                value={billId}
                onValueChange={(v) => {
                  setBillId(v);
                  const b = bills.find((x) => x.id === v);
                  if (b) {
                    const cap = Math.min(absAmount, b.outstanding_amount);
                    setBillPayAmount(String(cap));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={bills.length ? "Choose a bill" : "No open bills"} />
                </SelectTrigger>
                <SelectContent>
                  {bills.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {(b.bill_number ?? "Bill") +
                        " · " +
                        (b.supplier_name ?? "Supplier") +
                        " · " +
                        formatCurrency(b.outstanding_amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedBill ? (
              <div className="space-y-2">
                <Label>Amount to apply</Label>
                <input
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={billPayAmount}
                  onChange={(e) => setBillPayAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Still owed on this bill: {formatCurrency(selectedBill.outstanding_amount)}. Payment cannot exceed
                  your bank line ({formatCurrency(absAmount)}).
                </p>
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setStep("choose")} disabled={pending}>
                Back
              </Button>
              <Button
                type="button"
                disabled={pending || !billId || !billPayAmount}
                onClick={() => {
                  const n = parseFloat(billPayAmount);
                  if (!Number.isFinite(n) || n <= 0) {
                    toast.error("Enter a valid amount.");
                    return;
                  }
                  run(() =>
                    resolveBankSupplierPaymentAction({
                      transactionId: transaction.id,
                      billId,
                      amount: n,
                    }),
                  );
                }}
              >
                Confirm
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "customer" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Invoice</Label>
              <Select
                value={invoiceId}
                onValueChange={(v) => {
                  setInvoiceId(v);
                  const inv = invoices.find((x) => x.id === v);
                  if (inv) {
                    const cap = Math.min(transaction.amount, inv.outstanding_amount);
                    setInvoiceRecvAmount(String(cap));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={invoices.length ? "Choose an invoice" : "No open invoices"} />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {(inv.invoice_number ?? "Invoice") +
                        " · " +
                        (inv.customer_name ?? "Customer") +
                        " · " +
                        formatCurrency(inv.outstanding_amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedInvoice ? (
              <div className="space-y-2">
                <Label>Amount to apply</Label>
                <input
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={invoiceRecvAmount}
                  onChange={(e) => setInvoiceRecvAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Still outstanding: {formatCurrency(selectedInvoice.outstanding_amount)}.
                </p>
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setStep("choose")} disabled={pending}>
                Back
              </Button>
              <Button
                type="button"
                disabled={pending || !invoiceId || !invoiceRecvAmount}
                onClick={() => {
                  const n = parseFloat(invoiceRecvAmount);
                  if (!Number.isFinite(n) || n <= 0) {
                    toast.error("Enter a valid amount.");
                    return;
                  }
                  run(() =>
                    resolveBankCustomerReceiptAction({
                      transactionId: transaction.id,
                      invoiceId,
                      amount: n,
                    }),
                  );
                }}
              >
                Confirm
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

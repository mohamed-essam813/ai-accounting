"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactCombobox, type ContactOption } from "./contact-combobox";
import { BankAccountCombobox, type BankOption } from "./bank-account-combobox";
import {
  listContactsForPickerAction,
  listBankAccountsForPickerAction,
  createGuidedPaymentReceivedAction,
  createGuidedPaymentSentAction,
} from "@/lib/actions/guided-drafts";
import {
  listOpenBillsForSupplierAction,
  listOpenInvoicesForCustomerAction,
} from "@/lib/actions/open-documents";
import { listTaxRatesAction, type TaxRate } from "@/lib/actions/tax-rates";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { FileText, Receipt, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { listAccountsForItemWizardAction } from "@/lib/actions/items-picker";
import { MultiLineSupplierBillForm } from "./multi-line-supplier-bill-form";
import { MultiLineSalesInvoiceForm } from "./multi-line-sales-invoice-form";
import type { AccountOption } from "./account-combobox";

export type GuidedEventId = "invoice" | "bill" | "payment_in" | "payment_out";

const EVENTS: { id: GuidedEventId; label: string; icon: typeof FileText }[] = [
  { id: "invoice", label: "Sales invoice", icon: FileText },
  { id: "bill", label: "Supplier bill", icon: Receipt },
  { id: "payment_in", label: "Payment received", icon: ArrowDownLeft },
  { id: "payment_out", label: "Payment sent", icon: ArrowUpRight },
];

type Props = {
  onDraftCreated?: (draftId: string) => void;
};

export function GuidedEventWorkspace({ onDraftCreated }: Props) {
  const [selected, setSelected] = useState<GuidedEventId | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [pending, startTransition] = useTransition();

  const refreshContacts = useCallback(async () => {
    const list = await listContactsForPickerAction();
    setContacts(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, b, t] = await Promise.all([
        listContactsForPickerAction(),
        listBankAccountsForPickerAction(),
        listTaxRatesAction(),
      ]);
      if (!cancelled) {
        setContacts(c);
        setBanks(b);
        setTaxRates(t);
        try {
          const accs = await listAccountsForItemWizardAction();
          setAccounts(accs as AccountOption[]);
        } catch {
          // ignore (accounts will be required only for expense/asset bill)
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const outputTax = taxRates.filter((t) => t.tax_type === "output" && t.is_active);
  const inputTax = taxRates.filter((t) => t.tax_type === "input" && t.is_active);

  return (
    <Card>
      <CardHeader>
        <CardTitle>What would you like to record?</CardTitle>
        <CardDescription>
          Choose a type of transaction and fill in the details. No accounting wording required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {EVENTS.map((ev) => {
            const Icon = ev.icon;
            const isActive = selected === ev.id;
            return (
              <Button
                key={ev.id}
                type="button"
                variant={isActive ? "default" : "secondary"}
                size="sm"
                className="gap-2"
                onClick={() => setSelected(ev.id)}
              >
                <Icon className="h-4 w-4" />
                {ev.label}
              </Button>
            );
          })}
        </div>

        {selected === "invoice" ? (
          <MultiLineSalesInvoiceForm
            contacts={contacts}
            onRefreshContacts={refreshContacts}
            outputTax={outputTax}
            pending={pending}
            startTransition={startTransition}
            onDraftCreated={onDraftCreated}
          />
        ) : null}
        {selected === "bill" ? (
          <MultiLineSupplierBillForm
            contacts={contacts}
            onRefreshContacts={refreshContacts}
            inputTax={inputTax}
            accounts={accounts}
            pending={pending}
            startTransition={startTransition}
            onDraftCreated={onDraftCreated}
          />
        ) : null}
        {selected === "payment_in" ? (
          <PaymentInForm
            contacts={contacts}
            banks={banks}
            onRefreshContacts={refreshContacts}
            pending={pending}
            startTransition={startTransition}
            onDraftCreated={onDraftCreated}
          />
        ) : null}
        {selected === "payment_out" ? (
          <PaymentOutForm
            contacts={contacts}
            banks={banks}
            onRefreshContacts={refreshContacts}
            pending={pending}
            startTransition={startTransition}
            onDraftCreated={onDraftCreated}
          />
        ) : null}

        {!selected ? (
          <p className="text-sm text-muted-foreground">Select an option above to continue.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PaymentInForm({
  contacts,
  banks,
  onRefreshContacts,
  pending,
  startTransition,
  onDraftCreated,
}: {
  contacts: ContactOption[];
  banks: BankOption[];
  onRefreshContacts: () => Promise<void>;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  onDraftCreated?: (id: string) => void;
}) {
  const [customer, setCustomer] = useState<ContactOption | null>(null);
  const [bank, setBank] = useState<BankOption | null>(null);
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [refInvoice, setRefInvoice] = useState("");
  const [note, setNote] = useState("");
  const [openInvoices, setOpenInvoices] = useState<
    Array<{
      id: string;
      invoice_number: string | null;
      invoice_date: string;
      total_amount: number;
      outstanding_amount: number;
    }>
  >([]);
  const [allocByInvoiceId, setAllocByInvoiceId] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const id = customer?.id;
    if (!id) {
      setOpenInvoices([]);
      setAllocByInvoiceId({});
      return;
    }
    listOpenInvoicesForCustomerAction({ contactId: id })
      .then((rows) => {
        if (!cancelled) {
          setOpenInvoices(rows);
          setAllocByInvoiceId({});
        }
      })
      .catch(() => {
        if (!cancelled) setOpenInvoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [customer?.id]);

  const submit = () => {
    if (!customer || !bank) {
      toast.error("Choose customer and bank account.");
      return;
    }
    const amt = parseFloat(amount);
    if (!paymentDate || Number.isNaN(amt) || amt <= 0) {
      toast.error("Enter payment date and a valid amount.");
      return;
    }
    const allocations = Object.entries(allocByInvoiceId)
      .map(([invoiceId, v]) => ({ invoiceId, amount: parseFloat(v) }))
      .filter((a) => !Number.isNaN(a.amount) && a.amount > 0);
    const allocSum = allocations.reduce((s, a) => s + a.amount, 0);
    if (allocSum - amt > 0.01) {
      toast.error("Total allocations cannot exceed receipt amount.");
      return;
    }
    startTransition(async () => {
      try {
        const draft = await createGuidedPaymentReceivedAction({
          customerName: customer.name,
          paymentDate,
          amount: amt,
          bankAccountId: bank.id,
          referenceInvoice: refInvoice.trim() || undefined,
          note: note.trim() || undefined,
          allocations: allocations.length > 0 ? allocations : undefined,
        });
        if (draft?.id) {
          toast.success("Draft created — review it on the right.");
          onDraftCreated?.(draft.id);
        }
      } catch (e) {
        toast.error(getErrorMessage(e, "Could not create draft."));
      }
    });
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <h3 className="text-sm font-medium">Payment received</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <ContactCombobox
          label="Customer"
          placeholder="Search or add customer"
          value={customer}
          onChange={setCustomer}
          contacts={contacts}
          kind="customer"
          onContactsRefresh={onRefreshContacts}
          disabled={pending}
        />
        <BankAccountCombobox
          label="Bank account"
          placeholder="Select bank account"
          value={bank}
          onChange={setBank}
          banks={banks}
          disabled={pending}
        />
        <div className="space-y-2">
          <Label>Payment date</Label>
          <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label>Amount</Label>
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label>Reference invoice (optional)</Label>
          <Input value={refInvoice} onChange={(e) => setRefInvoice(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Note (optional)</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </div>

        {customer && openInvoices.length > 0 ? (
          <div className="space-y-2 sm:col-span-2 rounded-md border bg-background p-3">
            <p className="text-sm font-medium">Apply this receipt to open invoices</p>
            <p className="text-xs text-muted-foreground">
              Enter allocation amounts (partial and multi-invoice supported).
            </p>
            <div className="grid gap-2">
              {openInvoices.map((inv) => (
                <div key={inv.id} className="grid items-center gap-2 sm:grid-cols-5">
                  <div className="sm:col-span-2 text-sm">
                    {inv.invoice_number ?? "Invoice"}{" "}
                    <span className="text-muted-foreground">({inv.invoice_date})</span>
                  </div>
                  <div className="text-sm text-muted-foreground sm:text-right">
                    Outstanding: {inv.outstanding_amount.toFixed(2)}
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Allocation amount"
                      value={allocByInvoiceId[inv.id] ?? ""}
                      onChange={(e) =>
                        setAllocByInvoiceId((m) => ({ ...m, [inv.id]: e.target.value }))
                      }
                      disabled={pending}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Creating…" : "Generate draft"}
      </Button>
    </div>
  );
}

function PaymentOutForm({
  contacts,
  banks,
  onRefreshContacts,
  pending,
  startTransition,
  onDraftCreated,
}: {
  contacts: ContactOption[];
  banks: BankOption[];
  onRefreshContacts: () => Promise<void>;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  onDraftCreated?: (id: string) => void;
}) {
  const [supplier, setSupplier] = useState<ContactOption | null>(null);
  const [bank, setBank] = useState<BankOption | null>(null);
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [refBill, setRefBill] = useState("");
  const [note, setNote] = useState("");
  const [openBills, setOpenBills] = useState<
    Array<{
      id: string;
      bill_number: string | null;
      bill_date: string;
      total_amount: number;
      outstanding_amount: number;
    }>
  >([]);
  const [allocByBillId, setAllocByBillId] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const id = supplier?.id;
    if (!id) {
      setOpenBills([]);
      setAllocByBillId({});
      return;
    }
    listOpenBillsForSupplierAction({ contactId: id })
      .then((rows) => {
        if (!cancelled) {
          setOpenBills(rows);
          setAllocByBillId({});
        }
      })
      .catch(() => {
        if (!cancelled) setOpenBills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [supplier?.id]);

  const submit = () => {
    if (!supplier || !bank) {
      toast.error("Choose supplier and bank account.");
      return;
    }
    const amt = parseFloat(amount);
    if (!paymentDate || Number.isNaN(amt) || amt <= 0) {
      toast.error("Enter payment date and a valid amount.");
      return;
    }
    const allocations = Object.entries(allocByBillId)
      .map(([billId, v]) => ({ billId, amount: parseFloat(v) }))
      .filter((a) => !Number.isNaN(a.amount) && a.amount > 0);
    const allocSum = allocations.reduce((s, a) => s + a.amount, 0);
    if (allocSum - amt > 0.01) {
      toast.error("Total allocations cannot exceed payment amount.");
      return;
    }
    startTransition(async () => {
      try {
        const draft = await createGuidedPaymentSentAction({
          supplierName: supplier.name,
          paymentDate,
          amount: amt,
          bankAccountId: bank.id,
          referenceBill: refBill.trim() || undefined,
          note: note.trim() || undefined,
          allocations: allocations.length > 0 ? allocations : undefined,
        });
        if (draft?.id) {
          toast.success("Draft created — review it on the right.");
          onDraftCreated?.(draft.id);
        }
      } catch (e) {
        toast.error(getErrorMessage(e, "Could not create draft."));
      }
    });
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <h3 className="text-sm font-medium">Payment sent</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <ContactCombobox
          label="Supplier"
          placeholder="Search or add supplier"
          value={supplier}
          onChange={setSupplier}
          contacts={contacts}
          kind="vendor"
          onContactsRefresh={onRefreshContacts}
          disabled={pending}
        />
        <BankAccountCombobox
          label="Bank account"
          placeholder="Select bank account"
          value={bank}
          onChange={setBank}
          banks={banks}
          disabled={pending}
        />
        <div className="space-y-2">
          <Label>Payment date</Label>
          <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label>Amount</Label>
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label>Reference bill (optional)</Label>
          <Input value={refBill} onChange={(e) => setRefBill(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Note (optional)</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </div>

        {supplier && openBills.length > 0 ? (
          <div className="space-y-2 sm:col-span-2 rounded-md border bg-background p-3">
            <p className="text-sm font-medium">Apply this payment to open bills</p>
            <p className="text-xs text-muted-foreground">
              Enter allocation amounts (partial and multi-bill supported).
            </p>
            <div className="grid gap-2">
              {openBills.map((b) => (
                <div key={b.id} className="grid items-center gap-2 sm:grid-cols-5">
                  <div className="sm:col-span-2 text-sm">
                    {b.bill_number ?? "Bill"}{" "}
                    <span className="text-muted-foreground">({b.bill_date})</span>
                  </div>
                  <div className="text-sm text-muted-foreground sm:text-right">
                    Outstanding: {b.outstanding_amount.toFixed(2)}
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Allocation amount"
                      value={allocByBillId[b.id] ?? ""}
                      onChange={(e) =>
                        setAllocByBillId((m) => ({ ...m, [b.id]: e.target.value }))
                      }
                      disabled={pending}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Creating…" : "Generate draft"}
      </Button>
    </div>
  );
}

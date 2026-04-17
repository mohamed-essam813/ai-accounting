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
  loadGuidedEventWorkspacePreflightAction,
  createGuidedPaymentReceivedAction,
  createGuidedPaymentSentAction,
} from "@/lib/actions/guided-drafts";
import {
  listOpenBillsForSupplierAction,
  listOpenInvoicesForCustomerAction,
  type OpenBillRow,
  type OpenInvoiceRow,
} from "@/lib/actions/open-documents";
import { formatSettlementStatusLabel } from "@/lib/settlement/display-status";
import { type TaxRate } from "@/lib/actions/tax-rates";
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

  const refreshAccounts = useCallback(async () => {
    try {
      const accs = await listAccountsForItemWizardAction();
      setAccounts(accs as AccountOption[]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGuidedEventWorkspacePreflightAction()
      .then(({ contacts: c, banks: b, taxRates: t, accounts: accs }) => {
        if (cancelled) return;
        setContacts(c);
        setBanks(b);
        setTaxRates(t);
        setAccounts(accs as AccountOption[]);
      })
      .catch(() => {
        if (!cancelled) {
          setContacts([]);
          setBanks([]);
          setTaxRates([]);
          setAccounts([]);
        }
      });
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
            onRefreshAccounts={refreshAccounts}
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
  const [openInvoices, setOpenInvoices] = useState<OpenInvoiceRow[]>([]);
  const [allocByInvoiceId, setAllocByInvoiceId] = useState<Record<string, string>>({});
  const [showAllInvoices, setShowAllInvoices] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = customer?.id;
    if (!id) {
      setOpenInvoices([]);
      setAllocByInvoiceId({});
      return;
    }
    listOpenInvoicesForCustomerAction({ contactId: id, includeSettled: showAllInvoices })
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
  }, [customer?.id, showAllInvoices]);

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
    const byId = new Map(openInvoices.map((r) => [r.id, r]));
    for (const a of allocations) {
      const inv = byId.get(a.invoiceId);
      if (inv && a.amount - inv.outstanding_amount > 0.01) {
        toast.error(
          `Allocation for ${inv.invoice_number ?? "invoice"} cannot exceed outstanding (${inv.outstanding_amount.toFixed(2)}).`,
        );
        return;
      }
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
      </div>

      {customer ? (
        <div className="space-y-3 rounded-md border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Apply this receipt to open invoices</p>
              <p className="text-xs text-muted-foreground">
                Allocate to one or more invoices. Amounts cannot exceed each invoice&apos;s outstanding
                balance.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="rounded border-input"
                checked={showAllInvoices}
                onChange={(e) => setShowAllInvoices(e.target.checked)}
                disabled={pending}
              />
              Show all invoices (including paid)
            </label>
          </div>
          {openInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No invoices found for this customer
              {showAllInvoices ? "." : " with an open balance."}
            </p>
          ) : (
            <div className="space-y-3">
              {openInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="grid gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0 space-y-1 text-sm">
                    <div className="font-medium">
                      {inv.invoice_number ?? "Invoice"}{" "}
                      <span className="text-muted-foreground font-normal">({inv.invoice_date})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                      <span>Original: {inv.total_amount.toFixed(2)}</span>
                      <span>Paid: {inv.amount_received.toFixed(2)}</span>
                      <span className="font-medium text-foreground">
                        Outstanding: {inv.outstanding_amount.toFixed(2)}
                      </span>
                      <span>Status: {formatSettlementStatusLabel(inv.settlement_status)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 sm:w-44">
                    <Label className="text-xs text-muted-foreground">Allocation</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max={inv.outstanding_amount > 0 ? inv.outstanding_amount : undefined}
                      placeholder="0.00"
                      value={allocByInvoiceId[inv.id] ?? ""}
                      onChange={(e) =>
                        setAllocByInvoiceId((m) => ({ ...m, [inv.id]: e.target.value }))
                      }
                      disabled={pending || inv.outstanding_amount <= 0}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

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
  const [openBills, setOpenBills] = useState<OpenBillRow[]>([]);
  const [allocByBillId, setAllocByBillId] = useState<Record<string, string>>({});
  const [showAllBills, setShowAllBills] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = supplier?.id;
    if (!id) {
      setOpenBills([]);
      setAllocByBillId({});
      return;
    }
    listOpenBillsForSupplierAction({ contactId: id, includeSettled: showAllBills })
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
  }, [supplier?.id, showAllBills]);

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
    const byId = new Map(openBills.map((r) => [r.id, r]));
    for (const a of allocations) {
      const bill = byId.get(a.billId);
      if (bill && a.amount - bill.outstanding_amount > 0.01) {
        toast.error(
          `Allocation for ${bill.bill_number ?? "bill"} cannot exceed outstanding (${bill.outstanding_amount.toFixed(2)}).`,
        );
        return;
      }
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
      </div>

      {supplier ? (
        <div className="space-y-3 rounded-md border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Apply this payment to open bills</p>
              <p className="text-xs text-muted-foreground">
                Allocate to one or more bills. Amounts cannot exceed each bill&apos;s outstanding balance.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="rounded border-input"
                checked={showAllBills}
                onChange={(e) => setShowAllBills(e.target.checked)}
                disabled={pending}
              />
              Show all bills (including paid)
            </label>
          </div>
          {openBills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bills found for this supplier
              {showAllBills ? "." : " with an open balance."}
            </p>
          ) : (
            <div className="space-y-3">
              {openBills.map((b) => (
                <div
                  key={b.id}
                  className="grid gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0 space-y-1 text-sm">
                    <div className="font-medium">
                      {b.bill_number ?? "Bill"}{" "}
                      <span className="text-muted-foreground font-normal">({b.bill_date})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                      <span>Original: {b.total_amount.toFixed(2)}</span>
                      <span>Paid: {b.amount_paid.toFixed(2)}</span>
                      <span className="font-medium text-foreground">
                        Outstanding: {b.outstanding_amount.toFixed(2)}
                      </span>
                      <span>Status: {formatSettlementStatusLabel(b.settlement_status)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 sm:w-44">
                    <Label className="text-xs text-muted-foreground">Allocation</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max={b.outstanding_amount > 0 ? b.outstanding_amount : undefined}
                      placeholder="0.00"
                      value={allocByBillId[b.id] ?? ""}
                      onChange={(e) =>
                        setAllocByBillId((m) => ({ ...m, [b.id]: e.target.value }))
                      }
                      disabled={pending || b.outstanding_amount <= 0}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Creating…" : "Generate draft"}
      </Button>
    </div>
  );
}

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
  createGuidedInvoiceAction,
  createGuidedBillAction,
  createGuidedPaymentReceivedAction,
  createGuidedPaymentSentAction,
  getSaleCostPreviewAction,
} from "@/lib/actions/guided-drafts";
import {
  listOpenBillsForSupplierAction,
  listOpenInvoicesForCustomerAction,
} from "@/lib/actions/open-documents";
import { listTaxRatesAction, type TaxRate } from "@/lib/actions/tax-rates";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { FileText, Receipt, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { SmartItemSelector } from "./smart-item-selector";
import type { BusinessItem } from "@/lib/data/inventory";
import { AccountCombobox, type AccountOption } from "./account-combobox";
import { listAccountsForItemWizardAction } from "@/lib/actions/items-picker";
import { buildTransactionAmounts } from "@/lib/posting/transaction-amounts";

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
          <InvoiceForm
            contacts={contacts}
            onRefreshContacts={refreshContacts}
            outputTax={outputTax}
            pending={pending}
            startTransition={startTransition}
            onDraftCreated={onDraftCreated}
          />
        ) : null}
        {selected === "bill" ? (
          <BillForm
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

function InvoiceForm({
  contacts,
  onRefreshContacts,
  outputTax,
  pending,
  startTransition,
  onDraftCreated,
}: {
  contacts: ContactOption[];
  onRefreshContacts: () => Promise<void>;
  outputTax: TaxRate[];
  pending: boolean;
  startTransition: (cb: () => void) => void;
  onDraftCreated?: (id: string) => void;
}) {
  const [customer, setCustomer] = useState<ContactOption | null>(null);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lineItem, setLineItem] = useState<BusinessItem | null>(null);
  const [lineNote, setLineNote] = useState("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [serviceAmount, setServiceAmount] = useState("");
  const [taxRateId, setTaxRateId] = useState<string>("");
  const [taxTreatment, setTaxTreatment] = useState<"exclusive" | "inclusive">("exclusive");
  const [costPreview, setCostPreview] = useState<{
    unitCost: number | null;
    valuationMethod: string | null;
  }>({ unitCost: null, valuationMethod: null });

  const isInventoryProduct =
    lineItem != null && lineItem.item_type === "product" && lineItem.inventory_tracked;

  const suggestedTaxRateId =
    lineItem?.default_tax_rate_id && outputTax.some((t) => t.id === lineItem.default_tax_rate_id)
      ? lineItem.default_tax_rate_id
      : "";

  const selectedTax = taxRateId ? outputTax.find((t) => t.id === taxRateId) : null;
  const taxPct = selectedTax?.percentage ?? 0;

  const qtyNum = parseFloat(qty);
  const unitNum = parseFloat(unitPrice);
  const serviceAmtNum = parseFloat(serviceAmount);

  const enteredForAmounts = isInventoryProduct
    ? qtyNum * unitNum
    : serviceAmtNum;

  const amounts =
    !Number.isNaN(enteredForAmounts) && enteredForAmounts > 0
      ? buildTransactionAmounts({
          entered_amount: enteredForAmounts,
          tax_rate: taxPct,
          tax_treatment: taxTreatment,
        })
      : null;

  const displayCostPreview = isInventoryProduct
    ? costPreview
    : { unitCost: null as number | null, valuationMethod: null as string | null };

  const cogsEstimate =
    isInventoryProduct && displayCostPreview.unitCost != null && !Number.isNaN(qtyNum)
      ? qtyNum * displayCostPreview.unitCost
      : null;
  const marginEstimate =
    amounts && cogsEstimate != null ? amounts.subtotal_amount - cogsEstimate : null;

  useEffect(() => {
    if (!lineItem?.id || !isInventoryProduct) return;
    let cancelled = false;
    getSaleCostPreviewAction(lineItem.id).then((p) => {
      if (!cancelled) setCostPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [lineItem?.id, isInventoryProduct]);

  const handleLineItemChange = (item: BusinessItem | null) => {
    setLineItem(item);
    setQty("1");
    setUnitPrice("");
    setServiceAmount("");
    setCostPreview({ unitCost: null, valuationMethod: null });
  };

  const submit = () => {
    if (!customer) {
      toast.error("Choose a customer.");
      return;
    }
    if (!lineItem) {
      toast.error("Choose a product or service.");
      return;
    }
    if (!invoiceDate || !dueDate) {
      toast.error("Fill in dates.");
      return;
    }
    if (!amounts) {
      toast.error("Enter valid amounts for line and tax.");
      return;
    }
    if (isInventoryProduct) {
      if (Number.isNaN(qtyNum) || qtyNum <= 0 || Number.isNaN(unitNum) || unitNum < 0) {
        toast.error("Quantity and Unit Price are required for inventory items.");
        return;
      }
    } else if (Number.isNaN(serviceAmtNum) || serviceAmtNum <= 0) {
      toast.error("Amount is required.");
      return;
    }
    startTransition(async () => {
      try {
        const draft = await createGuidedInvoiceAction({
          customerName: customer.name,
          invoiceDate,
          dueDate,
          itemId: lineItem.id,
          lineNote: lineNote.trim() || undefined,
          quantity: isInventoryProduct ? qtyNum : undefined,
          unitPrice: isInventoryProduct ? unitNum : undefined,
          amount: !isInventoryProduct ? serviceAmtNum : undefined,
          taxRateId: taxRateId || null,
          taxTreatment,
          transactionAmounts: amounts,
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
      <h3 className="text-sm font-medium">Sales invoice</h3>
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
        <div className="space-y-2">
          <Label>Invoice date</Label>
          <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label>Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={pending} />
        </div>
        <SmartItemSelector
          taxRates={outputTax}
          value={lineItem}
          onChange={handleLineItemChange}
          disabled={pending}
        />
        <div className="space-y-2 sm:col-span-2">
          <Label>Additional note (optional)</Label>
          <Input
            value={lineNote}
            onChange={(e) => setLineNote(e.target.value)}
            disabled={pending}
            placeholder="Shown on the invoice line"
          />
        </div>

        {isInventoryProduct ? (
          <>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="Enter quantity"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                disabled={pending}
                aria-label="Quantity"
              />
            </div>
            <div className="space-y-2">
              <Label>Unit selling price</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                required
                placeholder="Enter unit selling price"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                disabled={pending}
                aria-label="Unit selling price"
              />
            </div>
            <div className="space-y-2 sm:col-span-2 rounded-md border bg-background/60 p-3 text-sm">
              <p className="text-muted-foreground">
                Line total (before tax):{" "}
                <span className="font-medium text-foreground">
                  {!Number.isNaN(qtyNum)
                    && !Number.isNaN(unitNum)
                    ? (qtyNum * unitNum).toFixed(2)
                    : "—"}
                </span>
              </p>
              {displayCostPreview.unitCost != null ? (
                <>
                  <p className="text-muted-foreground">
                    Cost price (from inventory, {displayCostPreview.valuationMethod ?? "fifo"}):{" "}
                    <span className="font-medium text-foreground">{displayCostPreview.unitCost.toFixed(2)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Est. COGS:{" "}
                    <span className="font-medium text-foreground">
                      {cogsEstimate != null ? cogsEstimate.toFixed(2) : "—"}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    Est. margin (before tax):{" "}
                    <span className="font-medium text-foreground">
                      {marginEstimate != null ? marginEstimate.toFixed(2) : "—"}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">Select an inventory-tracked product to see cost and margin.</p>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Enter amount"
              value={serviceAmount}
              onChange={(e) => setServiceAmount(e.target.value)}
              disabled={pending}
            />
          </div>
        )}

        <div className="space-y-2 sm:col-span-2 rounded-md border bg-background/50 p-3 text-sm">
          <p className="font-medium">Subtotal / Tax / Total</p>
          {amounts ? (
            <div className="grid gap-1 text-muted-foreground sm:grid-cols-3">
              <span>Subtotal: {amounts.subtotal_amount.toFixed(2)}</span>
              <span>Tax: {amounts.tax_amount.toFixed(2)}</span>
              <span>Total: {amounts.total_amount.toFixed(2)}</span>
            </div>
          ) : (
            <p className="text-muted-foreground">Enter line amounts to see tax breakdown.</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Tax</Label>
          <Select
            value={(taxRateId || suggestedTaxRateId) || "__none__"}
            onValueChange={(v) => setTaxRateId(v === "__none__" ? "" : v)}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue placeholder="No tax" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No tax</SelectItem>
              {outputTax.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.percentage}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tax on price</Label>
          <Select value={taxTreatment} onValueChange={(v) => setTaxTreatment(v as "exclusive" | "inclusive")} disabled={pending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exclusive">Added on top (exclusive)</SelectItem>
              <SelectItem value="inclusive">Included in amount (inclusive)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Creating…" : "Generate draft"}
      </Button>
    </div>
  );
}

function BillForm({
  contacts,
  onRefreshContacts,
  inputTax,
  accounts,
  pending,
  startTransition,
  onDraftCreated,
}: {
  contacts: ContactOption[];
  onRefreshContacts: () => Promise<void>;
  inputTax: TaxRate[];
  accounts: AccountOption[];
  pending: boolean;
  startTransition: (cb: () => void) => void;
  onDraftCreated?: (id: string) => void;
}) {
  type PurchaseType = "inventory" | "expense" | "asset";
  const [supplier, setSupplier] = useState<ContactOption | null>(null);
  const [billDate, setBillDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [purchaseType, setPurchaseType] = useState<PurchaseType>("expense");

  // Inventory fields
  const [lineItem, setLineItem] = useState<BusinessItem | null>(null);
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");

  // Expense fields
  const [expenseAccount, setExpenseAccount] = useState<AccountOption | null>(null);
  const [expenseDesc, setExpenseDesc] = useState("");

  // Asset fields
  const [assetName, setAssetName] = useState("");
  const [assetCategory, setAssetCategory] = useState("Equipment");
  const [assetAccount, setAssetAccount] = useState<AccountOption | null>(null);
  const [usefulLifeYears, setUsefulLifeYears] = useState("3");
  const [deprMethod, setDeprMethod] = useState<"straight_line">("straight_line");

  // Amount entry (ambiguous removed) — entered_amount means net (exclusive) or total (inclusive)
  const [enteredAmount, setEnteredAmount] = useState("");
  const [taxRateId, setTaxRateId] = useState<string>("");
  const [taxTreatment, setTaxTreatment] = useState<"exclusive" | "inclusive">("exclusive");

  const suggestedTaxRateId =
    lineItem?.default_tax_rate_id && inputTax.some((t) => t.id === lineItem.default_tax_rate_id)
      ? lineItem.default_tax_rate_id
      : "";

  const selectedTax = taxRateId ? inputTax.find((t) => t.id === taxRateId) : null;
  const taxPct = selectedTax?.percentage ?? 0;
  const amtNum = parseFloat(enteredAmount);
  const amounts =
    !Number.isNaN(amtNum) && amtNum > 0
      ? buildTransactionAmounts({
          entered_amount: amtNum,
          tax_rate: taxPct,
          tax_treatment: taxTreatment,
        })
      : null;

  const submit = () => {
    if (!supplier) {
      toast.error("Choose a supplier.");
      return;
    }
    if (!billDate || !dueDate) {
      toast.error("Fill in dates.");
      return;
    }
    if (!amounts) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (purchaseType === "inventory") {
      if (!lineItem) {
        toast.error("Select a product to add to inventory.");
        return;
      }
      const q = parseFloat(qty);
      const p = parseFloat(unitPrice);
      if (Number.isNaN(q) || q <= 0 || Number.isNaN(p) || p < 0) {
        toast.error("Quantity and Unit Price are required for inventory items.");
        return;
      }
    }
    if (purchaseType === "expense") {
      if (!expenseAccount) {
        toast.error("Choose an expense category.");
        return;
      }
      if (!expenseDesc.trim()) {
        toast.error("Add a short description.");
        return;
      }
    }
    if (purchaseType === "asset") {
      if (!assetAccount) {
        toast.error("Choose an asset account.");
        return;
      }
      if (!assetName.trim()) {
        toast.error("Enter an asset name.");
        return;
      }
      const yrs = parseInt(usefulLifeYears, 10);
      if (!yrs || yrs <= 0) {
        toast.error("Enter useful life (years).");
        return;
      }
    }
    startTransition(async () => {
      try {
        const draft = await createGuidedBillAction({
          supplierName: supplier.name,
          billDate,
          dueDate,
          purchaseType,
          itemId: purchaseType === "inventory" ? lineItem?.id : undefined,
          quantity: purchaseType === "inventory" ? parseFloat(qty) : undefined,
          unitPrice: purchaseType === "inventory" ? parseFloat(unitPrice) : undefined,
          expenseAccountId: purchaseType === "expense" ? expenseAccount?.id : undefined,
          description:
            purchaseType === "expense"
              ? expenseDesc.trim()
              : purchaseType === "inventory"
              ? lineItem?.name ?? ""
              : assetName.trim(),
          asset: purchaseType === "asset"
            ? {
                name: assetName.trim(),
                category: assetCategory,
                assetAccountId: assetAccount?.id ?? "",
                usefulLifeYears: parseInt(usefulLifeYears, 10),
                depreciationMethod: deprMethod,
              }
            : undefined,
          enteredAmount: amounts.entered_amount,
          taxRateId: taxRateId || null,
          taxTreatment,
          transactionAmounts: amounts,
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
      <h3 className="text-sm font-medium">Supplier bill</h3>
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
        <div className="space-y-2">
          <Label>Bill date</Label>
          <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label>Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>What did you purchase?</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["inventory", "Inventory (to sell)"],
              ["expense", "Expense (used immediately)"],
              ["asset", "Asset (used over time)"],
            ] as const).map(([id, text]) => (
              <Button
                key={id}
                type="button"
                variant={purchaseType === id ? "default" : "secondary"}
                size="sm"
                onClick={() => setPurchaseType(id)}
                disabled={pending}
              >
                {text}
              </Button>
            ))}
          </div>
        </div>

        {purchaseType === "inventory" ? (
          <>
            <SmartItemSelector taxRates={inputTax} value={lineItem} onChange={setLineItem} disabled={pending} />
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Enter quantity"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label>Unit price</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="Enter unit purchase price"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                disabled={pending}
              />
            </div>
          </>
        ) : null}

        {purchaseType === "expense" ? (
          <>
            <AccountCombobox
              label="Expense category"
              placeholder="Search expense accounts…"
              value={expenseAccount}
              onChange={setExpenseAccount}
              accounts={accounts}
              typeFilter={(t) => t === "expense"}
              disabled={pending}
            />
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Input value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} disabled={pending} placeholder="e.g. Office rent" />
            </div>
          </>
        ) : null}

        {purchaseType === "asset" ? (
          <>
            <div className="space-y-2 sm:col-span-2">
              <Label>Asset name</Label>
              <Input value={assetName} onChange={(e) => setAssetName(e.target.value)} disabled={pending} placeholder="e.g. MacBook Pro" />
            </div>
            <div className="space-y-2">
              <Label>Asset category</Label>
              <Select value={assetCategory} onValueChange={setAssetCategory} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Equipment", "Vehicle", "Furniture", "Computer", "Other"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AccountCombobox
              label="Asset account"
              placeholder="Search asset accounts…"
              value={assetAccount}
              onChange={setAssetAccount}
              accounts={accounts}
              typeFilter={(t) => t === "asset"}
              disabled={pending}
            />
            <div className="space-y-2">
              <Label>Useful life (years)</Label>
              <Input type="number" min="1" step="1" value={usefulLifeYears} onChange={(e) => setUsefulLifeYears(e.target.value)} disabled={pending} />
            </div>
            <div className="space-y-2">
              <Label>Depreciation</Label>
              <Select value={deprMethod} onValueChange={(v) => setDeprMethod(v as "straight_line")} disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="straight_line">Straight-line</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        ) : null}

        <div className="space-y-2 sm:col-span-2">
          <Label>{taxTreatment === "inclusive" ? "Total (tax included)" : "Subtotal (before tax)"}</Label>
          <Input type="number" step="0.01" min="0" value={enteredAmount} onChange={(e) => setEnteredAmount(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label>Tax</Label>
          <Select
            value={(taxRateId || suggestedTaxRateId) || "__none__"}
            onValueChange={(v) => setTaxRateId(v === "__none__" ? "" : v)}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue placeholder="No tax" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No tax</SelectItem>
              {inputTax.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.percentage}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tax on price</Label>
          <Select value={taxTreatment} onValueChange={(v) => setTaxTreatment(v as "exclusive" | "inclusive")} disabled={pending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exclusive">Added on top (exclusive)</SelectItem>
              <SelectItem value="inclusive">Included in amount (inclusive)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2 rounded-md border bg-background p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{amounts ? amounts.subtotal_amount.toFixed(2) : "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Tax{selectedTax ? ` (${selectedTax.percentage}%)` : ""}
            </span>
            <span className="font-medium">{amounts ? amounts.tax_amount.toFixed(2) : "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">{amounts ? amounts.total_amount.toFixed(2) : "—"}</span>
          </div>
        </div>
      </div>
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Creating…" : "Generate draft"}
      </Button>
    </div>
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

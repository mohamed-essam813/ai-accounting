"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactCombobox, type ContactOption } from "./contact-combobox";
import { SmartItemSelector } from "./smart-item-selector";
import { AccountCombobox, type AccountOption } from "./account-combobox";
import { createGuidedMultiLineBillAction } from "@/lib/actions/guided-drafts";
import type { BusinessItem } from "@/lib/data/inventory";
import type { TaxRate } from "@/lib/actions/tax-rates";
import { suggestBillLineClassification } from "@/lib/drafts/line-classification";
import { parseNaturalLanguageBillLines } from "@/lib/drafts/parse-natural-lines";
import { buildTransactionAmounts } from "@/lib/posting/transaction-amounts";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { PricesIncludeVatToggle, inferPricesIncludeVatFromText } from "@/components/prompt/prices-include-vat-toggle";

type BillLineUi = {
  id: string;
  classification: "inventory" | "expense" | "asset";
  confidence: number;
  item: BusinessItem | null;
  description: string;
  qty: string;
  unitPrice: string;
  lineAmount: string;
  expenseAccount: AccountOption | null;
  assetName: string;
  assetCategory: string;
  assetAccount: AccountOption | null;
  usefulLifeYears: string;
  taxRateId: string;
};

function newLine(inheritTaxRateId = ""): BillLineUi {
  return {
    id: crypto.randomUUID(),
    classification: "expense",
    confidence: 0.3,
    item: null,
    description: "",
    qty: "1",
    unitPrice: "",
    lineAmount: "",
    expenseAccount: null,
    assetName: "",
    assetCategory: "Equipment",
    assetAccount: null,
    usefulLifeYears: "3",
    taxRateId: inheritTaxRateId,
  };
}

function billTaxFromItemOrInherit(
  item: BusinessItem | null,
  currentTax: string,
  prevLineTax: string,
  rates: TaxRate[],
): string {
  if (item?.default_tax_rate_id && rates.some((t) => t.id === item.default_tax_rate_id)) {
    return item.default_tax_rate_id;
  }
  if (currentTax) return currentTax;
  return prevLineTax;
}

function chipLabel(c: BillLineUi["classification"]): string {
  if (c === "inventory") return "Detected: Inventory";
  if (c === "asset") return "Detected: Asset";
  return "Detected: Expense";
}

export function MultiLineSupplierBillForm({
  contacts,
  onRefreshContacts,
  onRefreshAccounts,
  inputTax,
  accounts,
  pending,
  startTransition,
  onDraftCreated,
}: {
  contacts: ContactOption[];
  onRefreshContacts: () => Promise<void>;
  /** Reload chart after inline account create */
  onRefreshAccounts?: () => Promise<void>;
  inputTax: TaxRate[];
  accounts: AccountOption[];
  pending: boolean;
  startTransition: (cb: () => void) => void;
  onDraftCreated?: (id: string) => void;
}) {
  const [supplier, setSupplier] = useState<ContactOption | null>(null);
  const [billDate, setBillDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taxTreatment, setTaxTreatment] = useState<"exclusive" | "inclusive">("exclusive");
  const [lines, setLines] = useState<BillLineUi[]>(() => [newLine()]);
  const [pasteHint, setPasteHint] = useState("");

  const parsePaste = () => {
    const inferred = inferPricesIncludeVatFromText(pasteHint);
    if (inferred) {
      setTaxTreatment(inferred);
    }
    const parsed = parseNaturalLanguageBillLines(pasteHint);
    if (parsed.length === 0) {
      toast.message("No lines found. Try one item per line, e.g. \"10 robots @ 2000\".");
      return;
    }
    let inheritTax = "";
    setLines(
      parsed.map((p) => {
        const base = newLine(inheritTax);
        inheritTax = base.taxRateId;
        base.description = p.description;
        base.classification = p.classification;
        base.confidence = p.confidence;
        if (p.quantity != null && p.unit_price != null) {
          base.qty = String(p.quantity);
          base.unitPrice = String(p.unit_price);
        }
        if (p.amount != null) base.lineAmount = String(p.amount);
        return base;
      }),
    );
    const hint =
      inferred === "inclusive"
        ? " “Prices include VAT” detected — set to Yes."
        : inferred === "exclusive"
          ? " “VAT on top” detected — set to No."
          : "";
    toast.success(`Found ${parsed.length} item(s).${hint} Review lines, then generate draft.`);
  };

  const lineNetAndTax = (L: BillLineUi): { net: number; taxPct: number } | null => {
    const tid = L.taxRateId;
    const tr = tid ? inputTax.find((t) => t.id === tid) : null;
    const taxPct = tr?.percentage ?? 0;
    if (L.classification === "inventory") {
      const q = parseFloat(L.qty);
      const u = parseFloat(L.unitPrice);
      if (Number.isNaN(q) || q <= 0 || Number.isNaN(u) || u < 0) return null;
      return { net: q * u, taxPct };
    }
    const a = parseFloat(L.lineAmount);
    if (Number.isNaN(a) || a <= 0) return null;
    return { net: a, taxPct };
  };

  const documentTotals = (() => {
    let sub = 0;
    let tax = 0;
    for (const L of lines) {
      const r = lineNetAndTax(L);
      if (!r) return null;
      const tx = buildTransactionAmounts({
        entered_amount: r.net,
        tax_rate: r.taxPct,
        tax_treatment: taxTreatment,
      });
      sub += tx.subtotal_amount;
      tax += tx.tax_amount;
    }
    return { subtotal: sub, tax, total: sub + tax };
  })();

  const submit = () => {
    if (!supplier || !billDate || !dueDate) {
      toast.error("Choose supplier and dates.");
      return;
    }
    const payloadLines: {
      classification: "inventory" | "expense" | "asset";
      description: string;
      line_net: number;
      tax_rate_id?: string | null;
      item_id?: string;
      quantity?: number;
      unit_price?: number;
      expense_account_id?: string;
      asset?: {
        name: string;
        category: string;
        asset_account_id: string;
        useful_life_years: number;
        depreciation_method: "straight_line";
      };
    }[] = [];
    for (const L of lines) {
      const netTax = lineNetAndTax(L);
      if (!netTax) {
        toast.error(`Fill amounts for line: ${L.description || "item"}`);
        return;
      }
      if (L.classification === "inventory") {
        if (!L.item?.id) {
          toast.error("Select a product for each inventory line.");
          return;
        }
        const q = parseFloat(L.qty);
        const u = parseFloat(L.unitPrice);
        payloadLines.push({
          classification: "inventory",
          description: L.description || L.item.name,
          line_net: netTax.net,
          tax_rate_id: L.taxRateId || null,
          item_id: L.item.id,
          quantity: q,
          unit_price: u,
        });
      } else if (L.classification === "expense") {
        if (!L.expenseAccount) {
          toast.error(`Choose an expense category for: ${L.description || "line"}`);
          return;
        }
        payloadLines.push({
          classification: "expense",
          description: L.description || "Expense",
          line_net: netTax.net,
          tax_rate_id: L.taxRateId || null,
          expense_account_id: L.expenseAccount.id,
          ...(L.item?.id ? { item_id: L.item.id } : {}),
        });
      } else {
        if (!L.assetAccount || !L.assetName.trim()) {
          toast.error(`Complete asset details for: ${L.description || "line"}`);
          return;
        }
        const yrs = parseInt(L.usefulLifeYears, 10);
        if (!yrs || yrs <= 0) {
          toast.error("Useful life (years) is required for asset lines.");
          return;
        }
        payloadLines.push({
          classification: "asset",
          description: L.description || L.assetName.trim(),
          line_net: netTax.net,
          tax_rate_id: L.taxRateId || null,
          asset: {
            name: L.assetName.trim(),
            category: L.assetCategory,
            asset_account_id: L.assetAccount.id,
            useful_life_years: yrs,
            depreciation_method: "straight_line",
          },
        });
      }
    }

    startTransition(async () => {
      try {
        const draft = await createGuidedMultiLineBillAction({
          supplierName: supplier.name,
          billDate,
          dueDate,
          taxTreatment,
          defaultTaxRateId: null,
          lines: payloadLines,
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
      <p className="text-xs text-muted-foreground">
        Add one or more lines — inventory, expense, or asset — in one bill. Choose tax on each line (new lines inherit
        from the line above). Classification updates when you pick an item.
      </p>

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
      </div>

      <PricesIncludeVatToggle value={taxTreatment} onChange={setTaxTreatment} disabled={pending} />

      <div className="space-y-2 rounded-md border bg-background/50 p-3">
        <Label>Smart paste (optional)</Label>
        <Textarea
          value={pasteHint}
          onChange={(e) => setPasteHint(e.target.value)}
          placeholder="e.g. 10 robot cleaners @ 2000&#10;delivery charges 500"
          rows={3}
          disabled={pending}
          className="text-sm"
        />
        <Button type="button" size="sm" variant="secondary" onClick={parsePaste} disabled={pending || !pasteHint.trim()}>
          Split into lines
        </Button>
      </div>

      <div className="space-y-3">
        {lines.map((L, idx) => (
          <div key={L.id} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-xs font-normal">
                  {chipLabel(L.classification)}
                  {L.confidence < 0.65 ? " · confirm below" : ""}
                </Badge>
                <Select
                  value={L.classification}
                  onValueChange={(v) =>
                    setLines((prev) =>
                      prev.map((x) =>
                        x.id === L.id ? { ...x, classification: v as BillLineUi["classification"], confidence: 1 } : x,
                      ),
                    )
                  }
                  disabled={pending}
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inventory">Inventory</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="asset">Asset</SelectItem>
                  </SelectContent>
                </Select>
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={pending}
                    onClick={() => setLines((prev) => prev.filter((x) => x.id !== L.id))}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            <SmartItemSelector
              uxMode={L.classification === "expense" ? "expense_line" : "default"}
              taxRates={inputTax}
              value={L.item}
              onChange={(item) => {
                setLines((prev) =>
                  prev.map((x) => {
                    if (x.id !== L.id) return x;
                    const idx = prev.findIndex((z) => z.id === L.id);
                    const prevTax = idx > 0 ? prev[idx - 1]?.taxRateId ?? "" : "";
                    const sug = suggestBillLineClassification(item);
                    const taxRateId = billTaxFromItemOrInherit(item, x.taxRateId, prevTax, inputTax);
                    let next: BillLineUi = {
                      ...x,
                      item,
                      description: item?.name ?? x.description,
                      taxRateId,
                    };
                    if (sug.classification === "inventory") {
                      next = { ...next, classification: "inventory", confidence: sug.confidence };
                    } else {
                      next = { ...next, classification: "expense", confidence: sug.confidence };
                    }
                    if (item?.expense_account_id && next.classification === "expense") {
                      const acc = accounts.find((a) => a.id === item.expense_account_id);
                      if (acc) next = { ...next, expenseAccount: acc };
                    }
                    return next;
                  }),
                );
              }}
              disabled={pending}
            />

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={L.description}
                onChange={(e) =>
                  setLines((prev) => prev.map((x) => (x.id === L.id ? { ...x, description: e.target.value } : x)))
                }
                disabled={pending}
                placeholder="What did you buy?"
              />
            </div>

            {L.classification === "inventory" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={L.qty}
                    onChange={(e) =>
                      setLines((prev) => prev.map((x) => (x.id === L.id ? { ...x, qty: e.target.value } : x)))
                    }
                    disabled={pending}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Unit price {taxTreatment === "inclusive" ? "(incl. VAT)" : "(before tax)"}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={L.unitPrice}
                    onChange={(e) =>
                      setLines((prev) => prev.map((x) => (x.id === L.id ? { ...x, unitPrice: e.target.value } : x)))
                    }
                    disabled={pending}
                  />
                </div>
              </div>
            ) : null}

            {L.classification === "expense" ? (
              <AccountCombobox
                label="Expense category"
                placeholder="Search expense accounts…"
                value={L.expenseAccount}
                onChange={(acc) =>
                  setLines((prev) => prev.map((x) => (x.id === L.id ? { ...x, expenseAccount: acc } : x)))
                }
                accounts={accounts}
                typeFilter={(t) => t === "expense"}
                disabled={pending}
                inlineCreateAccountType="expense"
                onAccountsRefresh={onRefreshAccounts}
              />
            ) : null}

            {L.classification === "asset" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Asset name</Label>
                  <Input
                    value={L.assetName}
                    onChange={(e) =>
                      setLines((prev) => prev.map((x) => (x.id === L.id ? { ...x, assetName: e.target.value } : x)))
                    }
                    disabled={pending}
                  />
                </div>
                <AccountCombobox
                  label="Asset account"
                  placeholder="Search…"
                  value={L.assetAccount}
                  onChange={(acc) =>
                    setLines((prev) => prev.map((x) => (x.id === L.id ? { ...x, assetAccount: acc } : x)))
                  }
                  accounts={accounts}
                  typeFilter={(t) => t === "asset"}
                  disabled={pending}
                  inlineCreateAccountType="asset"
                  onAccountsRefresh={onRefreshAccounts}
                />
                <div className="space-y-2">
                  <Label>Useful life (years)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={L.usefulLifeYears}
                    onChange={(e) =>
                      setLines((prev) => prev.map((x) => (x.id === L.id ? { ...x, usefulLifeYears: e.target.value } : x)))
                    }
                    disabled={pending}
                  />
                </div>
              </div>
            ) : null}

            {(L.classification === "expense" || L.classification === "asset") && (
              <div className="space-y-2">
                <Label>{taxTreatment === "inclusive" ? "Amount (tax included)" : "Amount (before tax)"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={L.lineAmount}
                  onChange={(e) =>
                    setLines((prev) => prev.map((x) => (x.id === L.id ? { ...x, lineAmount: e.target.value } : x)))
                  }
                  disabled={pending}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Tax rate for this line</Label>
              <Select
                value={L.taxRateId || "__none__"}
                onValueChange={(v) =>
                  setLines((prev) =>
                    prev.map((x) => (x.id === L.id ? { ...x, taxRateId: v === "__none__" ? "" : v } : x)),
                  )
                }
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No tax" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No tax (0%)</SelectItem>
                  {inputTax.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.percentage}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() =>
              setLines((prev) => {
                const inherit = prev[prev.length - 1]?.taxRateId ?? "";
                return [...prev, newLine(inherit)];
              })
            }
            disabled={pending}
          >
            <Plus className="h-4 w-4" />
            Add another item
          </Button>
          {lines.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={pending}
              onClick={() => {
                const source = lines.find((l) => l.taxRateId)?.taxRateId;
                if (!source) {
                  toast.message("Choose a tax rate on at least one line first.");
                  return;
                }
                setLines((prev) => prev.map((l) => ({ ...l, taxRateId: source })));
              }}
            >
              Apply same tax to all lines
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 p-4 space-y-2 text-sm">
        <p className="font-medium">Document summary</p>
        {documentTotals ? (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(documentTotals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatCurrency(documentTotals.tax)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-2">
              <span>Total</span>
              <span>{formatCurrency(documentTotals.total)}</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Enter line amounts to see totals.</p>
        )}
      </div>

      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Creating…" : "Generate draft"}
      </Button>
    </div>
  );
}

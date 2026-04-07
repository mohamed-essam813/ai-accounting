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
import { createGuidedMultiLineInvoiceAction } from "@/lib/actions/guided-drafts";
import type { BusinessItem } from "@/lib/data/inventory";
import type { TaxRate } from "@/lib/actions/tax-rates";
import { suggestInvoiceLineType } from "@/lib/drafts/line-classification";
import { buildTransactionAmounts } from "@/lib/posting/transaction-amounts";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { PricesIncludeVatToggle } from "@/components/prompt/prices-include-vat-toggle";

type InvLineUi = {
  id: string;
  line_type: "product" | "service";
  confidence: number;
  item: BusinessItem | null;
  description: string;
  qty: string;
  unitPrice: string;
  serviceAmount: string;
  taxRateId: string;
};

function newInvLine(inheritTaxRateId = ""): InvLineUi {
  return {
    id: crypto.randomUUID(),
    line_type: "service",
    confidence: 0.4,
    item: null,
    description: "",
    qty: "1",
    unitPrice: "",
    serviceAmount: "",
    taxRateId: inheritTaxRateId,
  };
}

function taxFromItemOrInherit(
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

export function MultiLineSalesInvoiceForm({
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
  const [taxTreatment, setTaxTreatment] = useState<"exclusive" | "inclusive">("exclusive");
  const [lines, setLines] = useState<InvLineUi[]>(() => [newInvLine()]);

  const lineNet = (L: InvLineUi): number | null => {
    const tid = L.taxRateId;
    const tr = tid ? outputTax.find((t) => t.id === tid) : null;
    const taxPct = tr?.percentage ?? 0;
    if (L.line_type === "product") {
      const q = parseFloat(L.qty);
      const u = parseFloat(L.unitPrice);
      if (Number.isNaN(q) || q <= 0 || Number.isNaN(u) || u < 0) return null;
      return q * u;
    }
    const a = parseFloat(L.serviceAmount);
    if (Number.isNaN(a) || a <= 0) return null;
    return a;
  };

  const documentTotals = (() => {
    let sub = 0;
    let tax = 0;
    for (const L of lines) {
      const net = lineNet(L);
      if (net == null) return null;
      const tid = L.taxRateId;
      const tr = tid ? outputTax.find((t) => t.id === tid) : null;
      const taxPct = tr?.percentage ?? 0;
      const tx = buildTransactionAmounts({
        entered_amount: net,
        tax_rate: taxPct,
        tax_treatment: taxTreatment,
      });
      sub += tx.subtotal_amount;
      tax += tx.tax_amount;
    }
    return { subtotal: sub, tax, total: sub + tax };
  })();

  const submit = () => {
    if (!customer || !invoiceDate || !dueDate) {
      toast.error("Choose customer and dates.");
      return;
    }
    const payload: Parameters<typeof createGuidedMultiLineInvoiceAction>[0]["lines"] = [];
    for (const L of lines) {
      const net = lineNet(L);
      if (net == null || !L.item?.id) {
        toast.error("Complete each line: item and amounts.");
        return;
      }
      payload.push({
        line_type: L.line_type,
        description: L.description || L.item.name,
        item_id: L.item.id,
        line_net: net,
        quantity: L.line_type === "product" ? parseFloat(L.qty) : undefined,
        unit_price: L.line_type === "product" ? parseFloat(L.unitPrice) : undefined,
        tax_rate_id: L.taxRateId || null,
      });
    }
    startTransition(async () => {
      try {
        const draft = await createGuidedMultiLineInvoiceAction({
          customerName: customer.name,
          invoiceDate,
          dueDate,
          taxTreatment,
          defaultTaxRateId: null,
          lines: payload,
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
      <p className="text-xs text-muted-foreground">
        Add lines with products or services. Pick the tax rate on each line (new lines copy the previous line&apos;s
        tax). Line type updates when you pick an item.
      </p>
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
      </div>

      <PricesIncludeVatToggle value={taxTreatment} onChange={setTaxTreatment} disabled={pending} />

      <div className="space-y-3">
        {lines.map((L, idx) => (
          <div key={L.id} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Line {idx + 1}</span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-xs font-normal">
                  {L.line_type === "product" ? "Detected: Product" : "Detected: Service"}
                </Badge>
                <Select
                  value={L.line_type}
                  onValueChange={(v) =>
                    setLines((prev) =>
                      prev.map((x) => (x.id === L.id ? { ...x, line_type: v as "product" | "service", confidence: 1 } : x)),
                    )
                  }
                  disabled={pending}
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
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
              taxRates={outputTax}
              value={L.item}
              onChange={(item) => {
                setLines((prev) =>
                  prev.map((x) => {
                    if (x.id !== L.id) return x;
                    const idx = prev.findIndex((z) => z.id === L.id);
                    const prevTax = idx > 0 ? prev[idx - 1]?.taxRateId ?? "" : "";
                    const sug = suggestInvoiceLineType(item);
                    const taxRateId = taxFromItemOrInherit(item, x.taxRateId, prevTax, outputTax);
                    return {
                      ...x,
                      item,
                      description: item?.name ?? x.description,
                      line_type: sug.line_type,
                      confidence: sug.confidence,
                      taxRateId,
                    };
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
              />
            </div>
            {L.line_type === "product" ? (
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
            ) : (
              <div className="space-y-2">
                <Label>{taxTreatment === "inclusive" ? "Amount (tax included)" : "Amount (before tax)"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={L.serviceAmount}
                  onChange={(e) =>
                    setLines((prev) => prev.map((x) => (x.id === L.id ? { ...x, serviceAmount: e.target.value } : x)))
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
                  {outputTax.map((t) => (
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
                return [...prev, newInvLine(inherit)];
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
        <p className="font-medium">Summary</p>
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

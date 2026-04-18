"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContactCombobox, type ContactOption } from "./contact-combobox";
import { createGuidedMultiLineBillAction } from "@/lib/actions/guided-drafts";
import type { TaxRate } from "@/lib/actions/tax-rates";
import { buildTransactionAmounts } from "@/lib/posting/transaction-amounts";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { Plus } from "lucide-react";
import { PricesIncludeVatToggle } from "@/components/prompt/prices-include-vat-toggle";
import { BillLineEditor, newBillLine, buildAssetDrafts, type BillLineUi } from "./bill-line-editor";
import { suggestBillLineClassification } from "@/lib/drafts/line-classification";
import type { AccountOption } from "./account-combobox";

// ─── Tax helpers ──────────────────────────────────────────────────────────────

function billTaxFromItemOrInherit(
  item: BillLineUi["item"],
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

// ─── Component ────────────────────────────────────────────────────────────────

export function MultiLineSupplierBillForm({
  capitalizationThresholdAed,
  contacts,
  onRefreshContacts,
  onRefreshAccounts,
  inputTax,
  accounts,
  pending,
  startTransition,
  onDraftCreated,
}: {
  capitalizationThresholdAed: number;
  contacts: ContactOption[];
  onRefreshContacts: () => Promise<void>;
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
  const [lines, setLines] = useState<BillLineUi[]>(() => [newBillLine()]);

  // ── Per-line change handler ──────────────────────────────────────────────────
  const handleLineChange = (id: string, updated: BillLineUi) => {
    setLines((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x;
        // When item changes on a line, auto-update classification and tax
        if (updated.item !== x.item) {
          const lineIndex = prev.findIndex((z) => z.id === id);
          const prevTax = lineIndex > 0 ? prev[lineIndex - 1]?.taxRateId ?? "" : "";
          const sug = suggestBillLineClassification(updated.item);
          const rawClass = sug.classification as string;
          const mapped = rawClass === "asset" ? "fixed_asset" : (rawClass as BillLineUi["classification"]);
          const taxRateId = billTaxFromItemOrInherit(updated.item, updated.taxRateId, prevTax, inputTax);
          let next = { ...updated, taxRateId };
          if (x.classification === x.aiClassification) {
            // Only auto-reclassify if user hasn't manually overridden
            next = { ...next, classification: mapped, aiClassification: mapped, confidence: sug.confidence };
          } else {
            next = { ...next, aiClassification: mapped, confidence: sug.confidence };
          }
          // Auto-fill expense account from item
          if (updated.item?.expense_account_id && next.classification === "expense") {
            const acc = accounts.find((a) => a.id === updated.item!.expense_account_id);
            if (acc) next = { ...next, expenseAccount: acc };
          }
          return next;
        }
        return updated;
      }),
    );
  };

  // ── Totals ───────────────────────────────────────────────────────────────────
  const documentTotals = (() => {
    let sub = 0;
    let tax = 0;
    for (const L of lines) {
      const tid = L.taxRateId;
      const tr = tid ? inputTax.find((t) => t.id === tid) : null;
      const taxPct = tr?.percentage ?? 0;
      let net: number;
      if (L.classification === "inventory") {
        const q = parseFloat(L.qty);
        const u = parseFloat(L.unitPrice);
        if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(u) || u < 0) return null;
        net = q * u;
      } else {
        const a = parseFloat(L.lineAmount);
        if (!Number.isFinite(a) || a <= 0) return null;
        net = a;
      }
      const tx = buildTransactionAmounts({ entered_amount: net, tax_rate: taxPct, tax_treatment: taxTreatment });
      sub += tx.subtotal_amount;
      tax += tx.tax_amount;
    }
    return { subtotal: sub, tax, total: sub + tax };
  })();

  // ── Submit ───────────────────────────────────────────────────────────────────
  const submit = () => {
    if (!supplier || !billDate || !dueDate) {
      toast.error("Choose supplier and dates.");
      return;
    }

    const payloadLines: Parameters<typeof createGuidedMultiLineBillAction>[0]["lines"] = [];

    for (const L of lines) {
      const tid = L.taxRateId;
      const tr = tid ? inputTax.find((t) => t.id === tid) : null;
      const taxPct = tr?.percentage ?? 0;
      let net: number;

      if (L.classification === "inventory") {
        const q = parseFloat(L.qty);
        const u = parseFloat(L.unitPrice);
        if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(u) || u < 0) {
          toast.error(`Fill valid amounts for line: ${L.description || "item"}`);
          return;
        }
        net = q * u;
        if (!L.item?.id) {
          toast.error("Select a product for each inventory line.");
          return;
        }
        payloadLines.push({
          classification: "inventory",
          description: L.description || L.item.name,
          line_net: net,
          tax_rate_id: L.taxRateId || null,
          item_id: L.item.id,
          quantity: q,
          unit_price: u,
        });
      } else if (L.classification === "expense") {
        const a = parseFloat(L.lineAmount);
        if (!Number.isFinite(a) || a <= 0) {
          toast.error(`Fill amounts for line: ${L.description || "expense"}`);
          return;
        }
        net = a;
        if (!L.expenseAccount) {
          toast.error(`Choose an expense category for: ${L.description || "line"}`);
          return;
        }
        payloadLines.push({
          classification: "expense",
          description: L.description || "Expense",
          line_net: net,
          tax_rate_id: L.taxRateId || null,
          expense_account_id: L.expenseAccount.id,
        });
      } else {
        // fixed_asset
        const a = parseFloat(L.lineAmount);
        if (!Number.isFinite(a) || a <= 0) {
          toast.error(`Fill cost for asset line: ${L.description || "asset"}`);
          return;
        }
        net = a;
        const tx = buildTransactionAmounts({ entered_amount: net, tax_rate: taxPct, tax_treatment: taxTreatment });
        if (!L.assetAccount || !L.assetName.trim()) {
          toast.error(`Complete asset details for: ${L.description || "line"}`);
          return;
        }
        const yrs = parseInt(L.usefulLifeYears, 10);
        if (!yrs || yrs <= 0) {
          toast.error("Useful life (years) is required for asset lines.");
          return;
        }
        const assetQty = Math.max(1, parseInt(L.assetQty, 10) || 1);
        const drafts = assetQty > 1 && L.assetDrafts.length === assetQty
          ? L.assetDrafts
          : buildAssetDrafts(L, assetQty);

        payloadLines.push({
          classification: "asset",
          description: L.description || L.assetName.trim(),
          line_net: tx.subtotal_amount,
          tax_rate_id: L.taxRateId || null,
          asset: {
            name: L.assetName.trim(),
            category: L.assetCategory,
            asset_account_id: L.assetAccount.id,
            useful_life_years: yrs,
            depreciation_method: L.depreciationMethod === "none" ? "straight_line" : L.depreciationMethod as "straight_line",
            quantity: assetQty,
            residual_value: parseFloat(L.residualValue) || 0,
            start_depreciation_date: L.startDepreciationDate || undefined,
            serial_number: L.serialNumber || undefined,
            location: L.location || undefined,
            assigned_to: L.assignedTo || undefined,
            depreciation_method_raw: L.depreciationMethod,
            asset_drafts: assetQty > 1 ? drafts : undefined,
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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <h3 className="text-sm font-medium">Supplier bill</h3>
      <p className="text-xs text-muted-foreground">
        Add one or more lines — inventory, expense, or fixed asset — in one bill. Capital items at or above{" "}
        {formatCurrency(capitalizationThresholdAed)} (your company capitalization threshold in Settings) are typically
        classified as fixed assets. Tax is chosen per line and new lines inherit from the line above.
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

      <div className="space-y-3">
        {lines.map((L, idx) => (
          <BillLineEditor
            key={L.id}
            line={L}
            index={idx}
            taxTreatment={taxTreatment}
            inputTax={inputTax}
            accounts={accounts}
            canRemove={lines.length > 1}
            pending={pending}
            onRefreshAccounts={onRefreshAccounts}
            onChange={(updated) => handleLineChange(L.id, updated)}
            onRemove={() => setLines((prev) => prev.filter((x) => x.id !== L.id))}
          />
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
                return [...prev, newBillLine(inherit)];
              })
            }
            disabled={pending}
          >
            <Plus className="h-4 w-4" />
            Add another item
          </Button>
          {lines.length > 1 && (
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
          )}
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

"use client";

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
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { SmartItemSelector } from "./smart-item-selector";
import { AccountCombobox, type AccountOption } from "./account-combobox";
import { FixedAssetReviewPanel, type AssetDraft } from "@/components/fixed-asset-review-panel";
import type { BusinessItem } from "@/lib/data/inventory";
import type { TaxRate } from "@/lib/actions/tax-rates";
import type { BillLineKind } from "@/lib/drafts/line-classification";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DepreciationMethod = "straight_line" | "reducing_balance" | "units_of_production" | "none";

export type BillLineUi = {
  id: string;
  // AI classification state
  classification: BillLineKind;
  aiClassification: BillLineKind;
  confidence: number;
  // Common
  item: BusinessItem | null;
  description: string;
  taxRateId: string;
  // Inventory
  qty: string;
  unitPrice: string;
  // Expense / Fixed Asset
  lineAmount: string;
  expenseAccount: AccountOption | null;
  // Fixed Asset
  assetQty: string;
  assetName: string;
  assetCategory: string;
  assetAccount: AccountOption | null;
  usefulLifeYears: string;
  residualValue: string;
  depreciationMethod: DepreciationMethod;
  startDepreciationDate: string;
  serialNumber: string;
  location: string;
  assignedTo: string;
  // Per-asset overrides when assetQty > 1
  assetDrafts: AssetDraft[];
};

const ASSET_CATEGORIES = [
  "Equipment",
  "Furniture & Fixtures",
  "Vehicles",
  "Computer Hardware",
  "Software",
  "Buildings & Leasehold Improvements",
  "Other",
];

const DEPRECIATION_METHOD_LABELS: Record<DepreciationMethod, string> = {
  straight_line: "Straight-Line",
  reducing_balance: "Reducing Balance (WDV)",
  units_of_production: "Units of Production",
  none: "No Depreciation",
};

function classificationLabel(c: BillLineKind): string {
  if (c === "inventory")   return "Detected: Inventory";
  if (c === "fixed_asset") return "Detected: Fixed Asset";
  return "Detected: Expense";
}

function classificationDisplayLabel(c: BillLineKind): string {
  if (c === "inventory")   return "Inventory";
  if (c === "fixed_asset") return "Fixed Asset";
  return "Expense";
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  line: BillLineUi;
  index: number;
  taxTreatment: "inclusive" | "exclusive";
  inputTax: TaxRate[];
  accounts: AccountOption[];
  canRemove: boolean;
  pending: boolean;
  onRefreshAccounts?: () => Promise<void>;
  onChange: (updated: BillLineUi) => void;
  onRemove: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function BillLineEditor({
  line: L,
  index,
  taxTreatment,
  inputTax,
  accounts,
  canRemove,
  pending,
  onRefreshAccounts,
  onChange,
  onRemove,
}: Props) {
  const set = (patch: Partial<BillLineUi>) => onChange({ ...L, ...patch });

  const isOverridden = L.classification !== L.aiClassification;
  const assetQtyNum = Math.max(1, parseInt(L.assetQty || "1", 10) || 1);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header row: item number + classification chip + type selector + delete */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-xs font-normal">
            {classificationLabel(L.aiClassification)}
            {L.confidence < 0.65 ? " · confirm below" : ""}
          </Badge>

          <Select
            value={L.classification}
            onValueChange={(v) => {
              const next = v as BillLineKind;
              set({ classification: next, confidence: 1 });
            }}
            disabled={pending}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inventory">Inventory</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="fixed_asset">Fixed Asset</SelectItem>
            </SelectContent>
          </Select>

          {isOverridden && (
            <Badge variant="outline" className="text-xs text-blue-700 border-blue-300 bg-blue-50">
              {classificationDisplayLabel(L.classification)} override
            </Badge>
          )}

          {canRemove && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={pending}
              onClick={onRemove}
              aria-label="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Inventory ─────────────────────────────────────────────────────── */}
      {L.classification === "inventory" && (
        <>
          <SmartItemSelector
            uxMode="default"
            taxRates={inputTax}
            value={L.item}
            onChange={(item) => set({ item, description: item?.name ?? L.description })}
            disabled={pending}
          />
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={L.description}
              onChange={(e) => set({ description: e.target.value })}
              disabled={pending}
              placeholder="What did you buy?"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={L.qty}
                onChange={(e) => set({ qty: e.target.value })}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label>Unit price {taxTreatment === "inclusive" ? "(incl. VAT)" : "(before tax)"}</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={L.unitPrice}
                onChange={(e) => set({ unitPrice: e.target.value })}
                disabled={pending}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Expense ───────────────────────────────────────────────────────── */}
      {L.classification === "expense" && (
        <>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={L.description}
              onChange={(e) => set({ description: e.target.value })}
              disabled={pending}
              placeholder="What did you buy?"
            />
          </div>
          <AccountCombobox
            label="Expense category"
            placeholder="Search expense accounts…"
            value={L.expenseAccount}
            onChange={(acc) => set({ expenseAccount: acc })}
            accounts={accounts}
            typeFilter={(t) => t === "expense"}
            disabled={pending}
            inlineCreateAccountType="expense"
            onAccountsRefresh={onRefreshAccounts}
          />
          <div className="space-y-2">
            <Label>{taxTreatment === "inclusive" ? "Amount (tax included)" : "Amount (before tax)"}</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={L.lineAmount}
              onChange={(e) => set({ lineAmount: e.target.value })}
              disabled={pending}
            />
          </div>
        </>
      )}

      {/* ── Fixed Asset ───────────────────────────────────────────────────── */}
      {L.classification === "fixed_asset" && (
        <>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={L.description}
              onChange={(e) => set({ description: e.target.value })}
              disabled={pending}
              placeholder="What did you buy?"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{taxTreatment === "inclusive" ? "Total cost (tax included)" : "Total cost (before tax)"}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={L.lineAmount}
                onChange={(e) => set({ lineAmount: e.target.value })}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label>Quantity (number of assets)</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={L.assetQty}
                onChange={(e) => {
                  const n = Math.max(1, parseInt(e.target.value, 10) || 1);
                  const drafts = buildAssetDrafts(L, n);
                  set({ assetQty: String(n), assetDrafts: drafts });
                }}
                disabled={pending}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Asset name {assetQtyNum > 1 ? "(base name — numbered automatically)" : ""}</Label>
              <Input
                value={L.assetName}
                onChange={(e) => {
                  const drafts = buildAssetDrafts({ ...L, assetName: e.target.value }, assetQtyNum);
                  set({ assetName: e.target.value, assetDrafts: drafts });
                }}
                disabled={pending}
                placeholder="e.g. Dell Laptop"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={L.assetCategory}
                onValueChange={(v) => set({ assetCategory: v })}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <AccountCombobox
              label="Asset account (PPE)"
              placeholder="Search asset accounts…"
              value={L.assetAccount}
              onChange={(acc) => set({ assetAccount: acc })}
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
                onChange={(e) => set({ usefulLifeYears: e.target.value })}
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label>Residual value (AED)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={L.residualValue}
                onChange={(e) => set({ residualValue: e.target.value })}
                disabled={pending}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label>Depreciation method</Label>
              <Select
                value={L.depreciationMethod}
                onValueChange={(v) => set({ depreciationMethod: v as DepreciationMethod })}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(DEPRECIATION_METHOD_LABELS) as [DepreciationMethod, string][]).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start depreciation date</Label>
              <Input
                type="date"
                value={L.startDepreciationDate}
                onChange={(e) => set({ startDepreciationDate: e.target.value })}
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label>Serial number (optional)</Label>
              <Input
                value={L.serialNumber}
                onChange={(e) => set({ serialNumber: e.target.value })}
                disabled={pending}
                placeholder="Manufacturer serial"
              />
            </div>

            <div className="space-y-2">
              <Label>Location (optional)</Label>
              <Input
                value={L.location}
                onChange={(e) => set({ location: e.target.value })}
                disabled={pending}
                placeholder="Office, warehouse…"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Assigned to (optional)</Label>
              <Input
                value={L.assignedTo}
                onChange={(e) => set({ assignedTo: e.target.value })}
                disabled={pending}
                placeholder="Employee or department"
              />
            </div>
          </div>

          {/* Per-asset review panel (quantity > 1) */}
          {assetQtyNum > 1 && (
            <FixedAssetReviewPanel
              baseName={L.assetName}
              totalCost={parseFloat(L.lineAmount) || 0}
              assets={L.assetDrafts}
              onChange={(drafts) => set({ assetDrafts: drafts })}
              disabled={pending}
            />
          )}
        </>
      )}

      {/* ── Tax rate row (all types) ───────────────────────────────────────── */}
      <div className="space-y-2">
        <Label>Tax rate for this line</Label>
        <Select
          value={L.taxRateId || "__none__"}
          onValueChange={(v) => set({ taxRateId: v === "__none__" ? "" : v })}
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
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build the per-asset drafts array when quantity changes, preserving existing edits. */
export function buildAssetDrafts(line: Pick<BillLineUi, "assetName" | "assetDrafts">, qty: number): AssetDraft[] {
  const existing = line.assetDrafts ?? [];
  return Array.from({ length: qty }, (_, i) => {
    const prev = existing[i];
    return {
      index: i,
      name: prev?.name ?? (qty > 1 ? `${line.assetName} ${i + 1}` : line.assetName),
      serialNumber: prev?.serialNumber ?? "",
      location: prev?.location ?? "",
      costOverride: prev?.costOverride ?? "",
    };
  });
}

/** Factory for a blank bill line with optional inherited tax rate. */
export function newBillLine(inheritTaxRateId = ""): BillLineUi {
  return {
    id: crypto.randomUUID(),
    classification: "expense",
    aiClassification: "expense",
    confidence: 0.3,
    item: null,
    description: "",
    taxRateId: inheritTaxRateId,
    qty: "1",
    unitPrice: "",
    lineAmount: "",
    expenseAccount: null,
    assetQty: "1",
    assetName: "",
    assetCategory: "Equipment",
    assetAccount: null,
    usefulLifeYears: "3",
    residualValue: "0",
    depreciationMethod: "straight_line",
    startDepreciationDate: "",
    serialNumber: "",
    location: "",
    assignedTo: "",
    assetDrafts: [],
  };
}

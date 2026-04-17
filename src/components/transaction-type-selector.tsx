"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles } from "lucide-react";

// ─── Transaction type registry ────────────────────────────────────────────────
export const TRANSACTION_TYPES = [
  { value: "sales_invoice",      label: "Sales Invoice" },
  { value: "purchase_bill",      label: "Purchase Invoice / Bill" },
  { value: "customer_receipt",   label: "Customer Receipt" },
  { value: "vendor_payment",     label: "Vendor Payment" },
  { value: "customer_advance",   label: "Customer Advance Received" },
  { value: "supplier_advance",   label: "Supplier Advance Paid" },
  { value: "credit_note",        label: "Credit Note (Sales)" },
  { value: "debit_note",         label: "Debit Note (Purchase)" },
  { value: "journal_adjustment", label: "Journal Adjustment" },
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number]["value"];

/** Map from AI intent enum values to our TransactionType. */
export function intentToTxType(intent: string | null | undefined): TransactionType {
  const map: Record<string, TransactionType> = {
    create_invoice:    "sales_invoice",
    create_bill:       "purchase_bill",
    record_payment:    "customer_receipt",
    reconcile_bank:    "journal_adjustment",
    create_credit_note: "credit_note",
    create_debit_note:  "debit_note",
  };
  return (intent && map[intent]) || "journal_adjustment";
}

export function txTypeLabel(value: TransactionType): string {
  return TRANSACTION_TYPES.find((t) => t.value === value)?.label ?? value;
}

/**
 * Default account-code template for each transaction type.
 * Used to repopulate lines when the user changes the transaction type.
 * Codes correspond to the standard UAE chart of accounts seeded by the app.
 */
export const TX_TYPE_DEFAULT_ACCOUNTS: Record<
  TransactionType,
  { debitCodes: string[]; creditCodes: string[] }
> = {
  sales_invoice:      { debitCodes: ["1100"],         creditCodes: ["4000", "2100"] },
  purchase_bill:      { debitCodes: ["5000", "1150"],  creditCodes: ["2000"] },
  customer_receipt:   { debitCodes: ["1010"],          creditCodes: ["1100"] },
  vendor_payment:     { debitCodes: ["2000"],          creditCodes: ["1010"] },
  customer_advance:   { debitCodes: ["1010"],          creditCodes: ["2400"] },
  supplier_advance:   { debitCodes: ["1350"],          creditCodes: ["1010"] },
  credit_note:        { debitCodes: ["4000", "2100"],  creditCodes: ["1100"] },
  debit_note:         { debitCodes: ["2000"],          creditCodes: ["5000", "1150"] },
  journal_adjustment: { debitCodes: [],                creditCodes: [] },
};

// ─── Component ────────────────────────────────────────────────────────────────
type Props = {
  value: TransactionType;
  aiDetected: TransactionType;
  onChange: (type: TransactionType) => void;
};

export function TransactionTypeSelector({ value, aiDetected, onChange }: Props) {
  const isOverridden = value !== aiDetected;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">AI detected:</span>
        <Badge
          variant="secondary"
          className="text-xs gap-1 font-normal"
        >
          {txTypeLabel(aiDetected)}
        </Badge>
        {isOverridden && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs text-muted-foreground"
            onClick={() => onChange(aiDetected)}
          >
            Reset
          </Button>
        )}
      </div>

      <Select value={value} onValueChange={(v) => onChange(v as TransactionType)}>
        <SelectTrigger className="h-8 w-56 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRANSACTION_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value} className="text-sm">
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isOverridden && (
        <Badge variant="outline" className="text-xs text-blue-700 border-blue-300 bg-blue-50">
          Type overridden
        </Badge>
      )}
    </div>
  );
}

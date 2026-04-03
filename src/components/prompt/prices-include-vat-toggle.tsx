"use client";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type TaxTreatment = "exclusive" | "inclusive";

export function PricesIncludeVatToggle({
  value,
  onChange,
  disabled,
}: {
  value: TaxTreatment;
  onChange: (v: TaxTreatment) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-background/50 p-3">
      <div className="space-y-1">
        <Label className="text-base">Prices include VAT?</Label>
        <p className="text-xs text-muted-foreground">
          Controls whether your prices already include VAT or VAT is added on top. Each line still picks the tax rate
          (5%, 0%, etc.) — that is classification; this is pricing logic for the whole document.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
          <Button
            type="button"
            variant={value === "exclusive" ? "default" : "ghost"}
            size="sm"
            className="px-5"
            disabled={disabled}
            onClick={() => onChange("exclusive")}
            aria-pressed={value === "exclusive"}
          >
            No
          </Button>
          <Button
            type="button"
            variant={value === "inclusive" ? "default" : "ghost"}
            size="sm"
            className="px-5"
            disabled={disabled}
            onClick={() => onChange("inclusive")}
            aria-pressed={value === "inclusive"}
          >
            Yes
          </Button>
        </div>
        <p className="text-xs text-muted-foreground max-w-md">
          {value === "exclusive"
            ? "Line amounts are before tax; tax is calculated on top (default)."
            : "Line amounts include VAT; we reverse-calculate net and VAT for each line."}
        </p>
      </div>
    </div>
  );
}

/** Optional hint from smart paste — returns null if no signal. */
export function inferPricesIncludeVatFromText(text: string): TaxTreatment | null {
  const t = text.toLowerCase();
  if (
    /\b(including\s+vat|inclusive\s+of\s+vat|vat\s+included|prices?\s+include\s+vat|gross\s+with\s+vat)\b/.test(t)
  ) {
    return "inclusive";
  }
  if (/\b(\+\s*vat|plus\s+vat|exclusive\s+of\s+vat|net\s+of\s+vat|excl\.?\s*vat|excluding\s+vat)\b/.test(t)) {
    return "exclusive";
  }
  return null;
}

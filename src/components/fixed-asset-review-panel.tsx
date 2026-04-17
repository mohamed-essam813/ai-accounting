"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { round2 } from "@/lib/posting/posting-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssetDraft = {
  index: number;
  name: string;
  serialNumber: string;
  location: string;
  /** If set, overrides the even-split cost. The last asset absorbs rounding. */
  costOverride: string;
};

type Props = {
  baseName: string;
  totalCost: number;
  assets: AssetDraft[];
  onChange: (assets: AssetDraft[]) => void;
  disabled?: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function FixedAssetReviewPanel({ baseName, totalCost, assets, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);

  const n = assets.length;
  if (n <= 1) return null;

  // Compute cost split: equal shares, last one absorbs rounding difference
  const baseCostEach = n > 0 ? round2(totalCost / n) : 0;
  const overriddenTotal = assets.reduce((sum, a, i) => {
    if (i === n - 1) return sum; // last asset gets remainder — skip for sum
    const v = parseFloat(a.costOverride);
    return sum + (Number.isFinite(v) ? round2(v) : baseCostEach);
  }, 0);
  const lastAssetCost = round2(totalCost - overriddenTotal);

  const setAsset = (index: number, patch: Partial<AssetDraft>) => {
    onChange(assets.map((a) => (a.index === index ? { ...a, ...patch } : a)));
  };

  // Validation: custom overrides must not exceed total
  const customOverrideTotal = assets.reduce((sum, a) => {
    const v = parseFloat(a.costOverride);
    return sum + (Number.isFinite(v) ? round2(v) : 0);
  }, 0);
  const hasOverrideError = customOverrideTotal > totalCost + 0.01;

  return (
    <div className="rounded-md border bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50"
        onClick={() => setOpen((p) => !p)}
        disabled={disabled}
      >
        <span className="flex items-center gap-2">
          {`Review ${n} individual assets`}
          {hasOverrideError && (
            <Badge variant="destructive" className="text-xs gap-1">
              <AlertCircle className="h-3 w-3" />
              Cost overrides exceed total
            </Badge>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t divide-y">
          <div className="px-4 py-2 text-xs text-muted-foreground">
            Total cost: <strong>AED {totalCost.toFixed(2)}</strong>
            {" "}· Default split: <strong>AED {baseCostEach.toFixed(2)}</strong> each
            {" "}· Last asset absorbs rounding.
          </div>

          {assets.map((a, i) => {
            const displayCost = i === n - 1
              ? lastAssetCost
              : (() => {
                  const v = parseFloat(a.costOverride);
                  return Number.isFinite(v) ? round2(v) : baseCostEach;
                })();

            return (
              <div key={a.index} className="px-4 py-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Asset {i + 1}
                  {i === n - 1 && (
                    <span className="ml-2 normal-case font-normal text-muted-foreground">
                      (cost: AED {displayCost.toFixed(2)} — absorbs rounding)
                    </span>
                  )}
                  {i < n - 1 && (
                    <span className="ml-2 normal-case font-normal text-muted-foreground">
                      cost: AED {displayCost.toFixed(2)}
                    </span>
                  )}
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={a.name}
                      onChange={(e) => setAsset(a.index, { name: e.target.value })}
                      disabled={disabled}
                      placeholder={`${baseName || "Asset"} ${i + 1}`}
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Serial number</Label>
                    <Input
                      value={a.serialNumber}
                      onChange={(e) => setAsset(a.index, { serialNumber: e.target.value })}
                      disabled={disabled}
                      placeholder="Optional"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Location</Label>
                    <Input
                      value={a.location}
                      onChange={(e) => setAsset(a.index, { location: e.target.value })}
                      disabled={disabled}
                      placeholder="Optional"
                      className="h-8 text-sm"
                    />
                  </div>

                  {i < n - 1 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Cost override (AED)
                        <span
                          className={cn(
                            "ml-1.5 text-[10px]",
                            a.costOverride ? "text-blue-600" : "text-muted-foreground",
                          )}
                        >
                          {a.costOverride ? "custom" : `default ${baseCostEach.toFixed(2)}`}
                        </span>
                      </Label>
                      <div className="flex gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={a.costOverride}
                          onChange={(e) => setAsset(a.index, { costOverride: e.target.value })}
                          disabled={disabled}
                          placeholder={baseCostEach.toFixed(2)}
                          className={cn(
                            "h-8 text-sm flex-1",
                            hasOverrideError && "border-destructive ring-1 ring-destructive",
                          )}
                        />
                        {a.costOverride && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => setAsset(a.index, { costOverride: "" })}
                            disabled={disabled}
                          >
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

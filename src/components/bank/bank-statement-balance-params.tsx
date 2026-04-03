"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Persists optional statement opening/closing in URL so summary difference survives refresh
 * and matches the founder&apos;s PDF figures.
 */
export function BankStatementBalanceParams() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");

  useEffect(() => {
    setOpening(searchParams.get("statementOpening") ?? "");
    setClosing(searchParams.get("statementClosing") ?? "");
  }, [searchParams]);

  const apply = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const o = opening.trim();
    const c = closing.trim();
    if (o === "") params.delete("statementOpening");
    else params.set("statementOpening", o);
    if (c === "") params.delete("statementClosing");
    else params.set("statementClosing", c);
    router.push(`/bank?${params.toString()}`);
  }, [opening, closing, router, searchParams]);

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Optional: balances from your bank statement (same period as import)
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="stmt-opening" className="text-xs">
            Statement opening balance
          </Label>
          <Input
            id="stmt-opening"
            type="number"
            step="0.01"
            placeholder="e.g. 10000.00"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="stmt-closing" className="text-xs">
            Statement closing balance
          </Label>
          <Input
            id="stmt-closing"
            type="number"
            step="0.01"
            placeholder="e.g. 25000.00"
            value={closing}
            onChange={(e) => setClosing(e.target.value)}
          />
        </div>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={apply}>
        Apply to summary
      </Button>
    </div>
  );
}

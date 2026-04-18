"use client";

import { useId, useState } from "react";
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
import { createManualFixedAssetAction } from "@/lib/actions/fixed-assets";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UsefulLifeDefaultRow } from "@/lib/data/company-settings";
import { resolveDefaultUsefulLifeYears, validateUsefulLifeYearsInput } from "@/lib/fixed-assets/useful-life";
import Link from "next/link";

type AccountOption = { id: string; code: string; name: string };

export function ManualAssetForm({
  assetAccounts,
  usefulLifeDefaults,
}: {
  assetAccounts: AccountOption[];
  usefulLifeDefaults: UsefulLifeDefaultRow[];
}) {
  const router = useRouter();
  const listId = useId();
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Office Equipment");
  const [cost, setCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [usefulLifeYears, setUsefulLifeYears] = useState("5");
  const [source, setSource] = useState<"manual" | "opening_balance">("manual");
  const [accountId, setAccountId] = useState(assetAccounts[0]?.id ?? "");
  const [dupOpen, setDupOpen] = useState(false);
  const [dups, setDups] = useState<{ id: string; name: string; cost: number; purchaseDate: string }[]>([]);

  const applyCategoryDefault = (cat: string) => {
    const y = resolveDefaultUsefulLifeYears(cat, usefulLifeDefaults);
    setUsefulLifeYears(String(y));
  };

  const runCreate = async (skipDuplicateCheck: boolean) => {
    if (!accountId) {
      toast.error("Select a PPE / asset ledger account.");
      return;
    }
    const y = Number.parseFloat(usefulLifeYears);
    const v = validateUsefulLifeYearsInput(y);
    if (v.valid === false) {
      toast.error(v.message);
      return;
    }
    if (v.valid && "warning" in v) {
      toast.info(v.warning);
    }
    setPending(true);
    try {
      const res = await createManualFixedAssetAction({
        name,
        category: category.trim(),
        cost: Number(cost),
        purchaseDate,
        usefulLifeYears: y,
        assetAccountId: accountId,
        source,
        skipDuplicateCheck,
      });
      if (!res.ok) {
        setDups(res.duplicates);
        setDupOpen(true);
        return;
      }
      if (res.lifeWarning) toast.info(res.lifeWarning);
      toast.success("Asset created");
      setDupOpen(false);
      router.push(`/fixed-assets/${res.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create asset");
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runCreate(false);
  };

  const noPpeAccounts = assetAccounts.length === 0;
  const defaultSuggestions =
    usefulLifeDefaults.length > 0
      ? usefulLifeDefaults.map((r) => r.category)
      : [
          "Computers & IT",
          "Furniture & Fixtures",
          "Vehicles",
          "Office Equipment",
          "Machinery",
          "Buildings",
        ];

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4 max-w-lg">
        {noPpeAccounts && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No fixed asset accounts</AlertTitle>
            <AlertDescription>
              Add an asset (PPE) account in Chart of Accounts before adding register rows manually.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="fa-name">Asset name</Label>
            <Input id="fa-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="fa-cat">Category</Label>
            <Input
              id="fa-cat"
              list={listId}
              value={category}
              onChange={(e) => {
                const v = e.target.value;
                setCategory(v);
                applyCategoryDefault(v);
              }}
              required
            />
            <datalist id={listId}>
              {defaultSuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">Picking a company category applies the default useful life in years</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fa-source">Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as "manual" | "opening_balance")}>
              <SelectTrigger id="fa-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="opening_balance">Opening balance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fa-cost">Cost (AED)</Label>
            <Input id="fa-cost" type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fa-date">Purchase date</Label>
            <Input id="fa-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fa-life">Useful life (years)</Label>
            <Input
              id="fa-life"
              type="number"
              step="0.1"
              min="0.1"
              value={usefulLifeYears}
              onChange={(e) => setUsefulLifeYears(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">1–50 years is typical. Stored in months for depreciation.</p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Capitalized to (PPE account)</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {assetAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={pending || noPpeAccounts}>
          {pending ? "Saving…" : "Add asset"}
        </Button>
      </form>
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Possible duplicate assets</DialogTitle>
            <DialogDescription>
              The same or very similar name, the same cost, and purchase within ±7 days. Continue, open an existing asset, or
              cancel.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {dups.map((d) => (
              <li key={d.id}>
                <Link href={`/fixed-assets/${d.id}`} className="text-primary underline" target="_blank" rel="noreferrer">
                  {d.name}
                </Link>{" "}
                — {d.purchaseDate} — {d.cost}
              </li>
            ))}
          </ul>
          <DialogFooter className="flex-wrap gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setDupOpen(false)}>
              Cancel
            </Button>
            {dups[0] && (
              <Button variant="outline" asChild>
                <Link href={`/fixed-assets/${dups[0]!.id}`} onClick={() => setDupOpen(false)}>
                  Open existing
                </Link>
              </Button>
            )}
            <Button
              onClick={() => {
                setDupOpen(false);
                void runCreate(true);
              }}
              disabled={pending}
            >
              Continue adding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

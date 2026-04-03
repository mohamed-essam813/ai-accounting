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
import { createManualFixedAssetAction } from "@/lib/actions/fixed-assets";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type AccountOption = { id: string; code: string; name: string };

export function ManualAssetForm({ assetAccounts }: { assetAccounts: AccountOption[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [cost, setCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("36");
  const [accountId, setAccountId] = useState(assetAccounts[0]?.id ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) {
      toast.error("Select a PPE / asset ledger account.");
      return;
    }
    setPending(true);
    try {
      const { id } = await createManualFixedAssetAction({
        name,
        category,
        cost: Number(cost),
        purchaseDate,
        usefulLifeMonths: Number.parseInt(usefulLifeMonths, 10),
        assetAccountId: accountId,
      });
      toast.success("Asset created");
      router.push(`/fixed-assets/${id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create asset");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 max-w-lg">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="fa-name">Asset name</Label>
          <Input id="fa-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fa-cat">Category</Label>
          <Input id="fa-cat" placeholder="e.g. IT equipment" value={category} onChange={(e) => setCategory(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fa-cost">Cost</Label>
          <Input id="fa-cost" type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fa-date">Purchase date</Label>
          <Input id="fa-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fa-life">Useful life (months)</Label>
          <Input id="fa-life" type="number" min="1" value={usefulLifeMonths} onChange={(e) => setUsefulLifeMonths(e.target.value)} required />
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
      <Button type="submit" disabled={pending || assetAccounts.length === 0}>
        {pending ? "Saving…" : "Add asset"}
      </Button>
    </form>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  searchItemsPickerAction,
  createItemWizardAction,
  listAccountsForItemWizardAction,
  listUomsForWizardAction,
  getItemPickerByIdAction,
} from "@/lib/actions/items-picker";
import type { BusinessItem } from "@/lib/data/inventory";
import type { TaxRate } from "@/lib/actions/tax-rates";
import { ChevronDown, Loader2, Package, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

type AccountOpt = { id: string; name: string; code: string; type: string };
type UomOpt = { id: string; name: string; abbreviation: string };

type Props = {
  label?: string;
  taxRates: TaxRate[];
  value: BusinessItem | null;
  onChange: (item: BusinessItem | null) => void;
  disabled?: boolean;
};

export function SmartItemSelector({
  label = "Product or service",
  taxRates,
  value,
  onChange,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BusinessItem[]>([]);
  const [createKind, setCreateKind] = useState<"product" | "service" | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const list = await searchItemsPickerAction(q);
      setResults(list);
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not search items."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void runSearch(query);
    }, 250);
    return () => clearTimeout(t);
  }, [open, query, runSearch]);

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
            <span className="font-medium">{value.name}</span>
            <span className="text-muted-foreground">
              {value.item_type === "service" ? "Service" : "Product"}
              {value.inventory_tracked ? " · Stock tracked" : ""}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onChange(null)}
              disabled={disabled}
              aria-label="Clear item"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="justify-start gap-2"
              disabled={disabled}
            >
              <Search className="h-4 w-4 opacity-70" />
              {value ? "Change…" : "Search or create…"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(100vw-2rem,28rem)] p-0" align="start">
            <div className="border-b p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Name, SKU, or keywords…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </div>
              ) : results.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No matches.</p>
              ) : (
                results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.item_type === "service" ? "Service" : "Product"}
                      {item.sku ? ` · SKU ${item.sku}` : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="border-t p-2 space-y-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setCreateKind("product");
                  setOpen(false);
                }}
              >
                <Package className="h-4 w-4" />
                Create new product
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setCreateKind("service");
                  setOpen(false);
                }}
              >
                <Sparkles className="h-4 w-4" />
                Create new service
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <CreateItemDialog
        kind={createKind}
        onClose={() => setCreateKind(null)}
        taxRates={taxRates}
        onCreated={async (id) => {
          const item = await getItemPickerByIdAction(id);
          if (item) onChange(item);
        }}
      />
    </div>
  );
}

function CreateItemDialog({
  kind,
  onClose,
  taxRates,
  onCreated,
}: {
  kind: "product" | "service" | null;
  onClose: () => void;
  taxRates: TaxRate[];
  onCreated: (id: string) => void;
}) {
  const open = kind !== null;
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [uoms, setUoms] = useState<UomOpt[]>([]);
  const [pending, setPending] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("unit");
  const [uomId, setUomId] = useState("");
  const [track, setTrack] = useState(true);
  const [revId, setRevId] = useState("");
  const [expId, setExpId] = useState("");
  const [invId, setInvId] = useState("");
  const [cogsId, setCogsId] = useState("");
  const [taxId, setTaxId] = useState<string>("__none__");
  const [sell, setSell] = useState("");
  const [cost, setCost] = useState("");
  const [keywords, setKeywords] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [a, u] = await Promise.all([
          listAccountsForItemWizardAction(),
          listUomsForWizardAction(),
        ]);
        if (!cancelled) {
          setAccounts(a);
          setUoms(u);
          if (u[0]?.id) setUomId(u[0].id);
        }
      } catch {
        toast.error("Could not load accounts or units.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setName("");
      setSku("");
      setUnit("unit");
      setTrack(true);
      setRevId("");
      setExpId("");
      setInvId("");
      setCogsId("");
      setTaxId("__none__");
      setSell("");
      setCost("");
      setKeywords("");
      setAdvOpen(false);
    }
  }, [open]);

  const submit = () => {
    if (!name.trim()) {
      toast.error("Enter a name.");
      return;
    }
    if (!revId) {
      toast.error("Choose a revenue account.");
      return;
    }
    setPending(true);
    (async () => {
      try {
        if (kind === "service") {
          const { id } = await createItemWizardAction({
            kind: "service",
            name: name.trim(),
            revenue_account_id: revId,
            expense_account_id: expId || null,
            default_tax_rate_id: taxId === "__none__" ? null : taxId,
            selling_price: sell ? parseFloat(sell) : null,
            keywords: keywords.trim() || null,
          });
          toast.success("Service created.");
          onCreated(id);
          onClose();
        } else if (kind === "product") {
          if (!uomId) {
            toast.error("Choose a unit.");
            setPending(false);
            return;
          }
          if (track) {
            if (!invId || !cogsId) {
              toast.error("Choose inventory and COGS accounts, or turn off stock tracking.");
              setPending(false);
              return;
            }
          }
          const { id } = await createItemWizardAction({
            kind: "product",
            name: name.trim(),
            inventory_tracked: track,
            sku: sku.trim() || null,
            unit: unit.trim() || "unit",
            uom_id: uomId,
            inventory_account_id: track ? invId : null,
            cogs_account_id: track ? cogsId : null,
            revenue_account_id: revId,
            expense_account_id: expId || null,
            default_tax_rate_id: taxId === "__none__" ? null : taxId,
            cost_price: cost ? parseFloat(cost) : null,
            selling_price: sell ? parseFloat(sell) : null,
            keywords: keywords.trim() || null,
          });
          toast.success("Product created.");
          onCreated(id);
          onClose();
        }
      } catch (e) {
        toast.error(getErrorMessage(e, "Could not create item."));
      } finally {
        setPending(false);
      }
    })();
  };

  const revenueAccounts = accounts.filter((a) => a.type === "revenue");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");
  const assetAccounts = accounts.filter((a) => a.type === "asset");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind === "service" ? "New service" : "New product"}</DialogTitle>
          <DialogDescription>
            We use these defaults when you sell or buy this item. You can refine them anytime in Inventory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website build" />
          </div>

          {kind === "product" ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  id="track"
                  type="checkbox"
                  className="h-4 w-4 rounded border"
                  checked={track}
                  onChange={(e) => setTrack(e.target.checked)}
                />
                <label htmlFor="track" className="text-sm">
                  Track inventory?
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>SKU (optional)</Label>
                  <Input value={sku} onChange={(e) => setSku(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>How do you usually sell this?</Label>
                  <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. hour, box" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Unit of measure</Label>
                <Select value={uomId} onValueChange={setUomId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {uoms.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.abbreviation})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {track ? (
                <>
                  <div className="space-y-2">
                    <Label>Inventory account</Label>
                    <Select value={invId} onValueChange={setInvId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Usually 1200" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {assetAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>COGS account</Label>
                    <Select value={cogsId} onValueChange={setCogsId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Usually 5500" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        {expenseAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          <div className="space-y-2">
            <Label>Default revenue account</Label>
            <Select value={revId} onValueChange={setRevId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose account" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {revenueAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Default expense account (optional)</Label>
            <Select value={expId || "__none__"} onValueChange={(v) => setExpId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="For supplier bills" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="__none__">None</SelectItem>
                {expenseAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Default tax</Label>
            <Select value={taxId} onValueChange={setTaxId}>
              <SelectTrigger>
                <SelectValue placeholder="No default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No default</SelectItem>
                {taxRates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.percentage}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Default price (optional)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={sell}
                onChange={(e) => setSell(e.target.value)}
              />
            </div>
            {kind === "product" ? (
              <div className="space-y-2">
                <Label>Cost price (optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 px-0"
            onClick={() => setAdvOpen((v) => !v)}
          >
            <ChevronDown className={`h-4 w-4 transition ${advOpen ? "rotate-180" : ""}`} />
            Advanced settings
          </Button>
          {advOpen ? (
            <div className="space-y-3 border-l-2 pl-3">
              <div className="space-y-2">
                <Label>Search keywords (optional)</Label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g. hosting, subscription"
                />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

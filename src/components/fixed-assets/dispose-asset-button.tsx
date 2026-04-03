"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { disposeFixedAssetAction } from "@/lib/actions/fixed-assets";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function DisposeAssetButton({ assetId, assetName }: { assetId: string; assetName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [proceeds, setProceeds] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const submit = async () => {
    setPending(true);
    try {
      const p = Number(proceeds);
      if (Number.isNaN(p) || p < 0) {
        toast.error("Enter valid proceeds.");
        return;
      }
      await disposeFixedAssetAction({
        assetId,
        disposalDate: date,
        proceeds: p,
      });
      toast.success("Asset disposed — journal posted.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disposal failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Dispose asset
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispose {assetName}</DialogTitle>
          <DialogDescription>
            Posts removal of cost and accumulated depreciation, records cash proceeds, and recognizes gain or loss.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="disp-date">Disposal date</Label>
            <Input id="disp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="disp-proceeds">Cash proceeds</Label>
            <Input id="disp-proceeds" type="number" step="0.01" min="0" value={proceeds} onChange={(e) => setProceeds(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Posting…" : "Post disposal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { disposeFixedAssetAction } from "@/lib/actions/fixed-assets";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const METHODS = [
  { id: "sold" as const, label: "Sold" },
  { id: "scrapped" as const, label: "Scrapped" },
  { id: "donated" as const, label: "Donated" },
  { id: "lost" as const, label: "Lost / stolen" },
  { id: "written_off" as const, label: "Written off" },
];

export function DisposeAssetButton({ assetId, assetName }: { assetId: string; assetName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [proceeds, setProceeds] = useState("0");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("sold");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [recipient, setRecipient] = useState("");

  const submit = async () => {
    if (!reason.trim()) {
      toast.error("Enter a reason for the disposal.");
      return;
    }
    setPending(true);
    try {
      const p = Number(proceeds);
      if (Number.isNaN(p) || p < 0) {
        toast.error("Enter valid proceeds (0 for scrap, donation, or loss).");
        return;
      }
      await disposeFixedAssetAction({
        assetId,
        disposalDate: date,
        proceeds: p,
        method,
        reason: reason.trim(),
        notes: notes.trim() || null,
        recipientOrBuyer: recipient.trim() || null,
      });
      toast.success("Disposal posted.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Disposal failed";
      if (msg.includes("7100") || msg.includes("Required accounts") || msg.includes("Gain on Disposal")) {
        toast.error(
          "Add chart accounts 7100 (Gain) and 7200 (Loss on Disposal) if missing, and ensure 1000 / 1600 and the asset account exist, then try again.",
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Dispose
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dispose {assetName}</DialogTitle>
          <DialogDescription>
            Posts removal of cost and accumulated depreciation, cash/bank for proceeds, and gain or loss. Ensure accounts
            7100/7200 (or your mapping) exist before first disposal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="disp-date">Disposal date</Label>
            <Input id="disp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as (typeof METHODS)[number]["id"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="disp-proceeds">Proceeds (AED, 0 if no cash received)</Label>
            <Input
              id="disp-proceeds"
              type="number"
              step="0.01"
              min="0"
              value={proceeds}
              onChange={(e) => setProceeds(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="disp-recip">Buyer / recipient (optional)</Label>
            <Input id="disp-recip" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="disp-reason">Reason (required)</Label>
            <Textarea id="disp-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="disp-notes">Notes (optional)</Label>
            <Textarea id="disp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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

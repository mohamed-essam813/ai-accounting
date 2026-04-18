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
import { transferFixedAssetAction } from "@/lib/actions/fixed-assets";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function TransferAssetButton({ assetId, currentLocation, currentAssignee }: { assetId: string; currentLocation: string | null; currentAssignee: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [toLocation, setToLocation] = useState(currentLocation ?? "");
  const [toAssignee, setToAssignee] = useState(currentAssignee ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async () => {
    if (!reason.trim()) {
      toast.error("Reason is required.");
      return;
    }
    setPending(true);
    try {
      await transferFixedAssetAction({
        assetId,
        transferDate: date,
        toLocation: toLocation.trim() || null,
        toAssignedTo: toAssignee.trim() || null,
        reason: reason.trim(),
        notes: notes.trim() || null,
      });
      toast.success("Transfer recorded (no GL impact).");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Transfer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer asset</DialogTitle>
          <DialogDescription>Update location and assignee. This does not post a journal line.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label>Transfer date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-loc">New location</Label>
            <Input id="tr-loc" value={toLocation} onChange={(e) => setToLocation(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-a">New assignee</Label>
            <Input id="tr-a" value={toAssignee} onChange={(e) => setToAssignee(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-r">Reason (required)</Label>
            <Textarea id="tr-r" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-n">Notes</Label>
            <Textarea id="tr-n" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

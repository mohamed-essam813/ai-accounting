"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deactivateContactAction } from "@/lib/actions/contacts";
import { toast } from "sonner";
import type { Database } from "@/lib/database.types";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];

export function ContactDetailActions({
  contact,
  outstanding,
}: {
  contact: Contact;
  outstanding: { ar: number; ap: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [pending, startTransition] = useTransition();

  const deactivate = () => {
    startTransition(async () => {
      try {
        await deactivateContactAction({
          contactId: contact.id,
          reason: reason || undefined,
          overrideReason: overrideReason || undefined,
        });
        toast.success("Contact deactivated");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <Link href={`/prompt`}>New invoice / bill</Link>
      </Button>
      {contact.is_active ? (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Deactivate
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Deactivate {contact.name}?</DialogTitle>
                <DialogDescription>
                  Hidden from pickers; history remains. Outstanding AR {outstanding.ar.toFixed(2)} · AP{" "}
                  {outstanding.ap.toFixed(2)} AED.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Override (if balance blocks)</Label>
                <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="secondary" onClick={deactivate} disabled={pending}>
                  Confirm
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}

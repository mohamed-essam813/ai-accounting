"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { mergeContactsAction } from "@/lib/actions/contacts";
import { toast } from "sonner";
import type { ContactsRow } from "@/lib/data/contacts";

type Pair = {
  a: ContactsRow;
  b: ContactsRow;
  ratio: number;
  ca: { invoices: number; bills: number; payments: number; journals: number };
  cb: { invoices: number; bills: number; payments: number; journals: number };
};

export function MergeContactsRow({ pair }: { pair: Pair }) {
  const router = useRouter();
  const [keep, setKeep] = useState<"a" | "b">("a");
  const [pending, startTransition] = useTransition();

  const merge = () => {
    const keepId = keep === "a" ? pair.a.id : pair.b.id;
    const mergeId = keep === "a" ? pair.b.id : pair.a.id;
    startTransition(async () => {
      try {
        await mergeContactsAction(keepId, mergeId, "Merged from duplicates page");
        toast.success("Contacts merged");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Merge failed");
      }
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={`rounded-lg border p-3 ${keep === "a" ? "ring-2 ring-primary" : ""}`}>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="radio" name="keep" checked={keep === "a"} onChange={() => setKeep("a")} />
          Keep: {pair.a.code}
        </label>
        <p className="mt-1 text-sm">{pair.a.name}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Tx: inv {pair.ca.invoices} · bills {pair.ca.bills} · pay {pair.ca.payments} · je {pair.ca.journals}
        </p>
      </div>
      <div className={`rounded-lg border p-3 ${keep === "b" ? "ring-2 ring-primary" : ""}`}>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="radio" name="keep" checked={keep === "b"} onChange={() => setKeep("b")} />
          Keep: {pair.b.code}
        </label>
        <p className="mt-1 text-sm">{pair.b.name}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Tx: inv {pair.cb.invoices} · bills {pair.cb.bills} · pay {pair.cb.payments} · je {pair.cb.journals}
        </p>
      </div>
      <div className="md:col-span-2">
        <Button type="button" size="sm" onClick={merge} disabled={pending}>
          Merge into selected “keep” contact
        </Button>
      </div>
    </div>
  );
}

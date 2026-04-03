"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { dedupeEntitiesForDisplay } from "@/lib/utils/entity-dedupe";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

const UNSET = "__unset__";

type Account = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  accounts: Account[];
  selectedAccountId?: string;
};

export function BankAccountSelector({ accounts, selectedAccountId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const accountsForUi = useMemo(
    () =>
      dedupeEntitiesForDisplay(
        accounts.map((a) => ({ ...a }) as unknown as Record<string, unknown>),
        { idKey: "id", entityLabel: "bank-account-selector" },
      ) as Account[],
    [accounts],
  );

  const handleChange = (accountId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (accountId === UNSET) {
      params.delete("bankAccountId");
    } else {
      params.set("bankAccountId", accountId);
    }
    router.push(`/bank?${params.toString()}`);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <label htmlFor="bank-account" className="text-sm font-medium">
              Bank account to reconcile
            </label>
            <Select
              value={selectedAccountId ?? UNSET}
              onValueChange={handleChange}
            >
              <SelectTrigger id="bank-account" className="w-[min(100%,380px)]">
                <SelectValue placeholder="Select a bank account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Select a bank account…</SelectItem>
                {accountsForUi.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Only bank accounts with external statements can be reconciled.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

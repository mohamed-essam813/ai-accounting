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
    if (accountId && accountId !== "all") {
      params.set("bankAccountId", accountId);
    } else {
      params.delete("bankAccountId");
    }
    router.push(`/bank?${params.toString()}`);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <label htmlFor="bank-account" className="text-sm font-medium">
              Select bank account to reconcile
            </label>
            <Select
              value={selectedAccountId ?? "all"}
              onValueChange={handleChange}
            >
              <SelectTrigger id="bank-account" className="w-[300px]">
                <SelectValue placeholder="Select bank account to reconcile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All bank accounts</SelectItem>
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

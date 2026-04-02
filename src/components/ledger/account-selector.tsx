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
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type Props = {
  accounts: Account[];
  selectedAccountCode?: string;
};

export function AccountSelector({ accounts, selectedAccountCode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortedAccounts = useMemo(() => {
    const deduped = dedupeEntitiesForDisplay(
      accounts.map((a) => ({ ...a }) as unknown as Record<string, unknown>),
      { idKey: "id", entityLabel: "ledger-account-select" },
    ) as Account[];
    return [...deduped].sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts]);

  const handleChange = (accountCode: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (accountCode && accountCode !== "all") {
      params.set("accountCode", accountCode);
    } else {
      params.delete("accountCode");
    }
    router.push(`/ledger?${params.toString()}`);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <Label htmlFor="account-selector" className="text-sm font-medium whitespace-nowrap">
              Select Account:
            </Label>
            <Select
              value={selectedAccountCode ?? "all"}
              onValueChange={handleChange}
            >
              <SelectTrigger id="account-selector" className="w-[400px]">
                <SelectValue placeholder="Select an account to view its ledger" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts (General Ledger)</SelectItem>
                {sortedAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.code}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{account.code}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{account.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground capitalize">
                        {account.type}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedAccountCode 
              ? "Showing transactions for the selected account with running balance."
              : "Select an account to view its general ledger with running balance, or view all accounts."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

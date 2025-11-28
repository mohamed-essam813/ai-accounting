"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PromptIntentEnum } from "@/lib/ai/schema";
import { updateIntentMappingAction } from "@/lib/actions/accounts";
import { toast } from "sonner";

type Account = {
  id: string;
  name: string;
  code: string;
  type: string;
};

type IntentMapping = {
  intent: string;
  debit_account_id: string;
  credit_account_id: string;
  tax_debit_account_id: string | null;
  tax_credit_account_id: string | null;
};

type Props = {
  accounts: Account[];
  mappings: IntentMapping[];
  canManage: boolean;
};

type PromptIntent = z.infer<typeof PromptIntentEnum>;

const SUPPORTED_INTENTS: PromptIntent[] = [
  "create_invoice",
  "create_bill",
  "record_payment",
];

export function IntentMappingTable({ accounts, mappings, canManage }: Props) {
  const mappingByIntent = useMemo(() => {
    return mappings.reduce<Record<string, IntentMapping>>((acc, mapping) => {
      acc[mapping.intent] = mapping;
      return acc;
    }, {});
  }, [mappings]);

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        label: `${account.code} · ${account.name}`,
      })),
    [accounts],
  );

  const getAccountLabel = (accountId: string | null | undefined) => {
    if (!accountId) return "None";
    return accountOptions.find((option) => option.id === accountId)?.label ?? "Unknown";
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Intent</TableHead>
            <TableHead>Debit Account</TableHead>
            <TableHead>Credit Account</TableHead>
            <TableHead>Tax Debit Account</TableHead>
            <TableHead>Tax Credit Account</TableHead>
            {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {SUPPORTED_INTENTS.map((intent) => (
            <MappingRow
              key={intent}
              intent={intent}
              initialMapping={mappingByIntent[intent]}
              accounts={accountOptions}
              canManage={canManage}
              getAccountLabel={getAccountLabel}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type MappingRowProps = {
  intent: PromptIntent;
  initialMapping?: IntentMapping;
  accounts: Array<{ id: string; label: string }>;
  canManage: boolean;
  getAccountLabel: (accountId: string | null | undefined) => string;
};

function MappingRow({
  intent,
  initialMapping,
  accounts,
  canManage,
  getAccountLabel,
}: MappingRowProps) {
  const [state, setState] = useState(() => ({
    debitAccountId: initialMapping?.debit_account_id ?? "",
    creditAccountId: initialMapping?.credit_account_id ?? "",
    taxDebitAccountId: initialMapping?.tax_debit_account_id ?? "",
    taxCreditAccountId: initialMapping?.tax_credit_account_id ?? "",
  }));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, startTransition] = useTransition();

  // Initialize state when mapping changes
  const mappingKey = `${initialMapping?.debit_account_id}-${initialMapping?.credit_account_id}-${initialMapping?.tax_debit_account_id}-${initialMapping?.tax_credit_account_id}`;
  
  useEffect(() => {
    // Use a small delay to avoid cascading renders
    const timeoutId = setTimeout(() => {
      setState({
        debitAccountId: initialMapping?.debit_account_id ?? "",
        creditAccountId: initialMapping?.credit_account_id ?? "",
        taxDebitAccountId: initialMapping?.tax_debit_account_id ?? "",
        taxCreditAccountId: initialMapping?.tax_credit_account_id ?? "",
      });
      setIsDirty(false);
    }, 0);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mappingKey,
  ]);

  const handleChange = (field: keyof typeof state, value: string) => {
    setState((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsDirty(true);
  };

  const handleSave = () => {
    if (!state.debitAccountId || !state.creditAccountId) {
      toast.error("Select both debit and credit accounts before saving.");
      return;
    }

    startTransition(async () => {
      try {
        await updateIntentMappingAction({
          intent,
          debitAccountId: state.debitAccountId,
          creditAccountId: state.creditAccountId,
          taxDebitAccountId: state.taxDebitAccountId || null,
          taxCreditAccountId: state.taxCreditAccountId || null,
        });
        toast.success("Mapping saved");
        setIsDirty(false);
      } catch (error) {
        console.error(error);
        toast.error("Failed to save mapping", {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  const intentLabel = intent.replaceAll("_", " ");

  return (
    <TableRow>
      <TableCell className="capitalize">{intentLabel}</TableCell>
      <TableCell>
        {canManage ? (
          <Select
            value={state.debitAccountId}
            onValueChange={(value) => handleChange("debitAccountId", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">
            {getAccountLabel(initialMapping?.debit_account_id ?? null)}
          </span>
        )}
      </TableCell>
      <TableCell>
        {canManage ? (
          <Select
            value={state.creditAccountId}
            onValueChange={(value) => handleChange("creditAccountId", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">
            {getAccountLabel(initialMapping?.credit_account_id ?? null)}
          </span>
        )}
      </TableCell>
      <TableCell>
        {canManage ? (
          <Select
            value={state.taxDebitAccountId}
            onValueChange={(value) => handleChange("taxDebitAccountId", value === "__none__" ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">
            {getAccountLabel(initialMapping?.tax_debit_account_id ?? null)}
          </span>
        )}
      </TableCell>
      <TableCell>
        {canManage ? (
          <Select
            value={state.taxCreditAccountId}
            onValueChange={(value) => handleChange("taxCreditAccountId", value === "__none__" ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">
            {getAccountLabel(initialMapping?.tax_credit_account_id ?? null)}
          </span>
        )}
      </TableCell>
      {canManage ? (
        <TableCell className="text-right">
          <Button
            size="sm"
            disabled={isSaving || !isDirty || !state.debitAccountId || !state.creditAccountId}
            onClick={handleSave}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}


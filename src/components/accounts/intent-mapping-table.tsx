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
import { getAllowedAccountTypes, getRestrictedAccountCodes } from "@/lib/accounting/gl-mapping-validation";
import { Badge } from "@/components/ui/badge";

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
  "create_credit_note",
  "create_debit_note",
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
        type: account.type,
        code: account.code,
      })),
    [accounts],
  );

  const getAccountLabel = (accountId: string | null | undefined) => {
    if (!accountId) return "None";
    const account = accountOptions.find((option) => option.id === accountId);
    if (!account) return "Unknown";
    return `${account.label} (${account.type})`;
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
  accounts: Array<{ id: string; label: string; type: string; code: string }>;
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
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Get allowed account types for this intent
  const allowedDebitTypes = getAllowedAccountTypes(intent, "debit");
  const allowedCreditTypes = getAllowedAccountTypes(intent, "credit");
  const allowedTaxDebitTypes = getAllowedAccountTypes(intent, "taxDebit");
  const allowedTaxCreditTypes = getAllowedAccountTypes(intent, "taxCredit");
  const restrictedTaxDebitCodes = getRestrictedAccountCodes(intent, "taxDebit");
  const restrictedTaxCreditCodes = getRestrictedAccountCodes(intent, "taxCredit");

  // Filter accounts based on allowed types
  const filteredDebitAccounts = useMemo(() => {
    if (allowedDebitTypes.length === 0) return accounts;
    return accounts.filter((acc) => allowedDebitTypes.includes(acc.type as any));
  }, [accounts, allowedDebitTypes]);

  const filteredCreditAccounts = useMemo(() => {
    if (allowedCreditTypes.length === 0) return accounts;
    return accounts.filter((acc) => allowedCreditTypes.includes(acc.type as any));
  }, [accounts, allowedCreditTypes]);

  const filteredTaxDebitAccounts = useMemo(() => {
    if (allowedTaxDebitTypes.length === 0) return accounts;
    return accounts.filter(
      (acc) =>
        allowedTaxDebitTypes.includes(acc.type as any) &&
        !restrictedTaxDebitCodes.includes(acc.code)
    );
  }, [accounts, allowedTaxDebitTypes, restrictedTaxDebitCodes]);

  const filteredTaxCreditAccounts = useMemo(() => {
    if (allowedTaxCreditTypes.length === 0) return accounts;
    return accounts.filter(
      (acc) =>
        allowedTaxCreditTypes.includes(acc.type as any) &&
        !restrictedTaxCreditCodes.includes(acc.code)
    );
  }, [accounts, allowedTaxCreditTypes, restrictedTaxCreditCodes]);

  // Helper to find selected account from full accounts list (not filtered)
  const findSelectedAccount = (accountId: string | null | undefined) => {
    if (!accountId) return null;
    return accounts.find((acc) => acc.id === accountId) || null;
  };

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

    // Clear previous validation errors
    setValidationErrors([]);

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
        setValidationErrors([]);
      } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred.";
        setValidationErrors([errorMessage]);
        toast.error("Failed to save mapping", {
          description: errorMessage,
        });
      }
    });
  };

  const intentLabel = intent.replaceAll("_", " ");

  return (
    <TableRow>
      <TableCell className="capitalize align-top pt-4">{intentLabel}</TableCell>
      <TableCell className="align-top pt-4">
        {canManage ? (
          <div className="space-y-1.5">
            <Select
              value={state.debitAccountId}
              onValueChange={(value) => handleChange("debitAccountId", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {filteredDebitAccounts.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No accounts available</div>
                ) : (
                  filteredDebitAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center gap-2">
                        <span>{account.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {account.type}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))
                )}
                {/* Include selected account even if not in filtered list */}
                {state.debitAccountId && !filteredDebitAccounts.find((a) => a.id === state.debitAccountId) && (
                  (() => {
                    const selected = findSelectedAccount(state.debitAccountId);
                    return selected ? (
                      <SelectItem key={selected.id} value={selected.id}>
                        <div className="flex items-center gap-2">
                          <span>{selected.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {selected.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ) : null;
                  })()
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {allowedDebitTypes.length > 0 ? `Allowed: ${allowedDebitTypes.join(", ")}` : "No restrictions"}
            </p>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {getAccountLabel(initialMapping?.debit_account_id ?? null)}
          </span>
        )}
      </TableCell>
      <TableCell className="align-top pt-4">
        {canManage ? (
          <div className="space-y-1.5">
            <Select
              value={state.creditAccountId}
              onValueChange={(value) => handleChange("creditAccountId", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {filteredCreditAccounts.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No accounts available</div>
                ) : (
                  filteredCreditAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center gap-2">
                        <span>{account.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {account.type}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))
                )}
                {/* Include selected account even if not in filtered list */}
                {state.creditAccountId && !filteredCreditAccounts.find((a) => a.id === state.creditAccountId) && (
                  (() => {
                    const selected = findSelectedAccount(state.creditAccountId);
                    return selected ? (
                      <SelectItem key={selected.id} value={selected.id}>
                        <div className="flex items-center gap-2">
                          <span>{selected.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {selected.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ) : null;
                  })()
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {allowedCreditTypes.length > 0 ? `Allowed: ${allowedCreditTypes.join(", ")}` : "No restrictions"}
            </p>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {getAccountLabel(initialMapping?.credit_account_id ?? null)}
          </span>
        )}
      </TableCell>
      <TableCell className="align-top pt-4">
        {canManage ? (
          <div className="space-y-1.5">
            <Select
              value={state.taxDebitAccountId || "__none__"}
              onValueChange={(value) => handleChange("taxDebitAccountId", value === "__none__" ? "" : value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {filteredTaxDebitAccounts.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No accounts available</div>
                ) : (
                  filteredTaxDebitAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center gap-2">
                        <span>{account.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {account.type}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))
                )}
                {/* Include selected account even if not in filtered list */}
                {state.taxDebitAccountId && !filteredTaxDebitAccounts.find((a) => a.id === state.taxDebitAccountId) && (
                  (() => {
                    const selected = findSelectedAccount(state.taxDebitAccountId);
                    return selected ? (
                      <SelectItem key={selected.id} value={selected.id}>
                        <div className="flex items-center gap-2">
                          <span>{selected.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {selected.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ) : null;
                  })()
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {state.taxDebitAccountId ? (
                allowedTaxDebitTypes.length > 0 ? `Allowed: ${allowedTaxDebitTypes.join(", ")}` : "Optional - no restrictions"
              ) : (
                allowedTaxDebitTypes.length > 0 ? `Allowed: ${allowedTaxDebitTypes.join(", ")}` : "Optional - no restrictions"
              )}
              {state.taxDebitAccountId && restrictedTaxDebitCodes.length > 0 && (
                <span className="block text-amber-600 mt-0.5">
                  Restricted: {restrictedTaxDebitCodes.join(", ")} (e.g., Cash)
                </span>
              )}
            </p>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {getAccountLabel(initialMapping?.tax_debit_account_id ?? null)}
          </span>
        )}
      </TableCell>
      <TableCell className="align-top pt-4">
        {canManage ? (
          <div className="space-y-1.5">
            <Select
              value={state.taxCreditAccountId || "__none__"}
              onValueChange={(value) => handleChange("taxCreditAccountId", value === "__none__" ? "" : value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {filteredTaxCreditAccounts.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No accounts available</div>
                ) : (
                  filteredTaxCreditAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center gap-2">
                        <span>{account.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {account.type}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))
                )}
                {/* Include selected account even if not in filtered list */}
                {state.taxCreditAccountId && !filteredTaxCreditAccounts.find((a) => a.id === state.taxCreditAccountId) && (
                  (() => {
                    const selected = findSelectedAccount(state.taxCreditAccountId);
                    return selected ? (
                      <SelectItem key={selected.id} value={selected.id}>
                        <div className="flex items-center gap-2">
                          <span>{selected.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {selected.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ) : null;
                  })()
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {state.taxCreditAccountId ? (
                allowedTaxCreditTypes.length > 0 ? `Allowed: ${allowedTaxCreditTypes.join(", ")}` : "Optional - no restrictions"
              ) : (
                allowedTaxCreditTypes.length > 0 ? `Allowed: ${allowedTaxCreditTypes.join(", ")}` : "Optional - no restrictions"
              )}
              {state.taxCreditAccountId && restrictedTaxCreditCodes.length > 0 && (
                <span className="block text-amber-600 mt-0.5">
                  Restricted: {restrictedTaxCreditCodes.join(", ")} (e.g., Cash)
                </span>
              )}
            </p>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {getAccountLabel(initialMapping?.tax_credit_account_id ?? null)}
          </span>
        )}
      </TableCell>
      {canManage ? (
        <TableCell className="text-right align-top pt-4">
          <div className="flex flex-col items-end gap-2">
            <Button
              size="sm"
              disabled={isSaving || !isDirty || !state.debitAccountId || !state.creditAccountId}
              onClick={handleSave}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
            {validationErrors.length > 0 && (
              <div className="text-xs text-destructive max-w-xs text-right">
                {validationErrors.map((error, idx) => (
                  <p key={idx}>{error}</p>
                ))}
              </div>
            )}
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}


"use client";

import { useEffect, useState, useTransition } from "react";
import { getDraftJournalPreview, updateDraftJournalLines } from "@/lib/actions/drafts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { Database } from "@/lib/database.types";
import { formatCoaAccountLabel } from "@/lib/drafts/account-display";
import { useDraftEditStore } from "@/contexts/draft-edit-store";

type Account = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

type Props = {
  draftId: string;
  editable?: boolean;
  accounts?: Account[];
};

type JournalLine = {
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  memo: string | null;
};

export function JournalPreview({ draftId, editable = true, accounts: initialAccounts }: Props) {
  const draftEditStore = useDraftEditStore();
  const previewFromStore =
    draftEditStore?.draftId === draftId ? draftEditStore.journalPreview : null;
  const storeErr = draftEditStore?.draftId === draftId ? draftEditStore.previewError : null;

  const [preview, setPreview] = useState<Awaited<ReturnType<typeof getDraftJournalPreview>> | null>(null);
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts ?? []);
  const [editingLines, setEditingLines] = useState<JournalLine[]>([]);
  const [editingDescription, setEditingDescription] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const applyPreviewPayload = (
    data: Awaited<ReturnType<typeof getDraftJournalPreview>>,
    accs: Account[],
  ) => {
    setPreview(data);
    setAccounts(accs);
    setEditingLines(
      data.journalLines.map((line) => ({
        account_id: line.account_id,
        account_code: line.account_code,
        account_name: line.account_name,
        debit: line.debit,
        credit: line.credit,
        memo: line.memo ?? "",
      })),
    );
    setEditingDescription(data.description);
  };

  useEffect(() => {
    if (previewFromStore) {
      applyPreviewPayload(previewFromStore, initialAccounts ?? []);
      setError(storeErr);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(storeErr ?? null);

    Promise.all([
      getDraftJournalPreview(draftId),
      initialAccounts ? Promise.resolve(initialAccounts) : Promise.resolve([]),
    ])
      .then(([data, accs]) => {
        if (!cancelled) {
          applyPreviewPayload(data, accs);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load preview");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draftId, initialAccounts, previewFromStore, storeErr]);

  const handleSave = () => {
    if (!preview) return;

    const totalDebit = editingLines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = editingLines.reduce((sum, line) => sum + line.credit, 0);

    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      toast.error("Journal entry is not balanced", {
        description: `Debit: ${formatCurrency(totalDebit, preview.entities.currency)}, Credit: ${formatCurrency(totalCredit, preview.entities.currency)}`,
      });
      return;
    }

    startTransition(async () => {
      try {
        await updateDraftJournalLines({
          draftId,
          description: editingDescription,
          journalLines: editingLines.map((line) => ({
            account_id: line.account_id,
            debit: line.debit,
            credit: line.credit,
            memo: line.memo || null,
          })),
        });
        toast.success("Journal preview updated");
        setIsEditing(false);
        // Reload preview
        const data = await getDraftJournalPreview(draftId);
        applyPreviewPayload(data, accounts);
        await draftEditStore?.refreshJournalPreview();
      } catch (error) {
        console.error(error);
        toast.error("Failed to update journal preview", {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  const handleCancel = () => {
    if (!preview) return;
    setEditingLines(
      preview.journalLines.map((line) => ({
        account_id: line.account_id,
        account_code: line.account_code,
        account_name: line.account_name,
        debit: line.debit,
        credit: line.credit,
        memo: line.memo ?? "",
      }))
    );
    setEditingDescription(preview.description);
    setIsEditing(false);
  };

  const addLine = () => {
    const firstAccount = accounts[0];
    if (!firstAccount) return;
    setEditingLines([
      ...editingLines,
      {
        account_id: firstAccount.id,
        account_code: firstAccount.code,
        account_name: firstAccount.name,
        debit: 0,
        credit: 0,
        memo: "",
      },
    ]);
  };

  const removeLine = (index: number) => {
    setEditingLines(editingLines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, updates: Partial<JournalLine>) => {
    const newLines = [...editingLines];
    newLines[index] = { ...newLines[index], ...updates };
    setEditingLines(newLines);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Journal Entry Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Journal Entry Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error ?? "Failed to load preview"}</p>
        </CardContent>
      </Card>
    );
  }

  const displayLines = isEditing ? editingLines : preview.journalLines;
  const displayDescription = isEditing ? editingDescription : preview.description;
  const totalDebit = displayLines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = displayLines.reduce((sum, line) => sum + line.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const accountOptions = accounts.map((acc) => ({
    id: acc.id,
    label: formatCoaAccountLabel(acc.code, acc.name),
  }));

  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Journal Entry Preview</CardTitle>
          {editable && !isEditing && (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="text-sm font-medium">{formatDate(preview.entities.date)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {preview.intent === "create_invoice" ? "Invoice Number" : preview.intent === "create_bill" ? "Bill Number" : "Document"}
            </p>
            <p className="text-sm font-medium font-mono break-all">
              {preview.entities.invoice_number ?? "—"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Counterparty</p>
            <p className="text-sm font-medium wrap-break-word">{preview.entities.counterparty ?? "—"}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="text-sm font-medium tabular-nums">
              {formatCurrency(preview.entities.amount, preview.entities.currency)}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-2">Description</p>
          {isEditing ? (
            <Textarea
              value={editingDescription}
              onChange={(e) => setEditingDescription(e.target.value)}
              rows={2}
              className="min-w-0 max-w-full"
            />
          ) : (
            <p className="text-sm wrap-break-word">{displayDescription}</p>
          )}
        </div>

        <div className="min-w-0 max-w-full rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-0">Account</TableHead>
                <TableHead className="w-[1%] whitespace-nowrap text-right tabular-nums">Debit</TableHead>
                <TableHead className="w-[1%] whitespace-nowrap text-right tabular-nums">Credit</TableHead>
                <TableHead className="min-w-0">Memo</TableHead>
                {isEditing && <TableHead className="w-16 min-w-18"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayLines.map((line, idx) => {
                const account = accounts.find((a) => a.id === line.account_id);
                return (
                  <TableRow key={idx}>
                    <TableCell className="min-w-0 align-top">
                      {isEditing ? (
                        <Select
                          value={line.account_id}
                          onValueChange={(value) => {
                            const selectedAccount = accounts.find((a) => a.id === value);
                            if (selectedAccount) {
                              updateLine(idx, {
                                account_id: selectedAccount.id,
                                account_code: selectedAccount.code,
                                account_name: selectedAccount.name,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="h-9 w-full min-w-0 max-w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {accountOptions.map((opt) => (
                              <SelectItem key={opt.id} value={opt.id}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div
                          className="min-w-0 truncate text-sm"
                          title={formatCoaAccountLabel(line.account_code, account?.name ?? line.account_name)}
                        >
                          {formatCoaAccountLabel(line.account_code, account?.name ?? line.account_name)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.debit || ""}
                          onChange={(e) =>
                            updateLine(idx, {
                              debit: Number(e.target.value) || 0,
                              credit: 0,
                            })
                          }
                          className="w-24 text-right font-mono"
                        />
                      ) : (
                        <span className="font-mono text-sm">
                          {line.debit > 0 ? formatCurrency(line.debit, preview.entities.currency) : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.credit || ""}
                          onChange={(e) =>
                            updateLine(idx, {
                              credit: Number(e.target.value) || 0,
                              debit: 0,
                            })
                          }
                          className="w-24 text-right font-mono"
                        />
                      ) : (
                        <span className="font-mono text-sm">
                          {line.credit > 0 ? formatCurrency(line.credit, preview.entities.currency) : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-0 align-top whitespace-normal">
                      {isEditing ? (
                        <Input
                          value={line.memo || ""}
                          onChange={(e) => updateLine(idx, { memo: e.target.value })}
                          placeholder="Memo"
                          className="w-full min-w-0 max-w-full text-xs"
                        />
                      ) : (
                        <span
                          className="line-clamp-4 text-xs text-muted-foreground wrap-break-word"
                          title={line.memo ?? undefined}
                        >
                          {line.memo ?? "—"}
                        </span>
                      )}
                    </TableCell>
                    {isEditing && (
                      <TableCell className="w-14 shrink-0 align-top">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeLine(idx)}
                          className="text-destructive hover:text-destructive"
                        >
                          Remove
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {isEditing && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Button size="sm" variant="outline" onClick={addLine}>
                      Add Line
                    </Button>
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="bg-muted font-semibold">
                <TableCell className="min-w-0">Total</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatCurrency(totalDebit, preview.entities.currency)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatCurrency(totalCredit, preview.entities.currency)}
                </TableCell>
                <TableCell className="min-w-0 whitespace-normal" colSpan={isEditing ? 2 : 1}>
                  {isBalanced ? (
                    <span className="text-green-600 text-xs">✓ Balanced</span>
                  ) : (
                    <span className="text-destructive text-xs">
                      Unbalanced ({formatCurrency(Math.abs(totalDebit - totalCredit), preview.entities.currency)})
                    </span>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {isEditing && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !isBalanced}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


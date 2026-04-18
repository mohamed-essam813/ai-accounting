"use client";

import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  useTransition,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountPicker, type CoAAccount } from "./account-picker";
import {
  TransactionTypeSelector,
  TX_TYPE_DEFAULT_ACCOUNTS,
  intentToTxType,
  type TransactionType,
} from "./transaction-type-selector";
import type { UserRole } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AiJournalLine = {
  account_code: string;
  /** Model output only — never shown or persisted; CoA name wins after code resolution. */
  account_name?: string;
  debit: number;
  credit: number;
  memo?: string;
};

export type JournalLine = {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  memo: string;
};

type LineStatus = "ai_suggested" | "manually_overridden" | "new_line";

type EditorLine = {
  id: string;
  // Frozen AI original — used for reset and feedback diff
  ai_account_code: string | null;
  ai_account_id: string | null;
  ai_account_name: string | null;
  ai_debit: number;
  ai_credit: number;
  ai_memo: string;
  // Current editable state
  account: CoAAccount | null;
  debit: string;   // kept as string to allow "0" / "" / "100.5" without rounding
  credit: string;
  memo: string;
  status: LineStatus;
};

type EntryEntities = {
  date: string;
  counterparty?: string | null;
  description?: string | null;
  amount: number;
  currency: string;
  invoice_number?: string | null;
  tax?: { rate: number; amount: number | null } | null;
};

type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  lineErrors: Map<string, string[]>;
};

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  journalEntryId: string;
  aiLines: AiJournalLine[];
  entities: EntryEntities;
  /** Intent string from the AI engine, e.g. "create_invoice". */
  detectedIntent: string;
  userRole: UserRole;
  userId: string;
  onSaveDraft: (lines: JournalLine[]) => Promise<void>;
  onPostToLedger: (lines: JournalLine[]) => Promise<void>;
  /** When false, "Post to Ledger" is hidden (user cannot approve/post). */
  allowPostToLedger?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _uid = 0;
const uid = () => `jel_${++_uid}`;

function fmtAED(n: number | string): string {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (!isFinite(v)) return "AED 0.00";
  return (
    "AED " +
    Math.abs(v).toLocaleString("en-AE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function parseAmt(s: string): number {
  const v = parseFloat(s);
  return isFinite(v) && v >= 0 ? v : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Map CoA by account code for O(1) lookups. */
function coaByCode(coa: CoAAccount[]): Map<string, CoAAccount> {
  return new Map(coa.map((a) => [a.code, a]));
}

/** Initialise editor lines from AI output; resolves accounts against the CoA. */
function initLines(aiLines: AiJournalLine[], byCode: Map<string, CoAAccount>): EditorLine[] {
  if (aiLines.length === 0) {
    // Blank template: one debit row, one credit row
    return [
      {
        id: uid(), ai_account_code: null, ai_account_id: null, ai_account_name: null,
        ai_debit: 0, ai_credit: 0, ai_memo: "",
        account: null, debit: "", credit: "", memo: "", status: "new_line",
      },
      {
        id: uid(), ai_account_code: null, ai_account_id: null, ai_account_name: null,
        ai_debit: 0, ai_credit: 0, ai_memo: "",
        account: null, debit: "", credit: "", memo: "", status: "new_line",
      },
    ];
  }
  return aiLines.map((l) => {
    const account = byCode.get(l.account_code) ?? null;
    return {
      id: uid(),
      ai_account_code: l.account_code,
      ai_account_id: account?.id ?? null,
      ai_account_name: account?.name ?? null,
      ai_debit: l.debit,
      ai_credit: l.credit,
      ai_memo: l.memo ?? "",
      account,
      debit: l.debit > 0 ? l.debit.toFixed(2) : "",
      credit: l.credit > 0 ? l.credit.toFixed(2) : "",
      memo: l.memo ?? "",
      status: "ai_suggested" as LineStatus,
    };
  });
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(
  lines: EditorLine[],
  txType: TransactionType,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lineErrors = new Map<string, string[]>();

  const addLineErr = (id: string, msg: string) => {
    if (!lineErrors.has(id)) lineErrors.set(id, []);
    lineErrors.get(id)!.push(msg);
  };

  const totalDebits = round2(lines.reduce((s, l) => s + parseAmt(l.debit), 0));
  const totalCredits = round2(lines.reduce((s, l) => s + parseAmt(l.credit), 0));
  const diff = round2(Math.abs(totalDebits - totalCredits));
  const isBalanced = diff < 0.005;

  if (!isBalanced) {
    errors.push(`Out of balance by ${fmtAED(diff)}`);
  }

  const hasAnyDebit = lines.some((l) => parseAmt(l.debit) > 0);
  const hasAnyCredit = lines.some((l) => parseAmt(l.credit) > 0);
  if (!hasAnyDebit) errors.push("At least one line must have a debit amount.");
  if (!hasAnyCredit) errors.push("At least one line must have a credit amount.");

  for (const l of lines) {
    const d = parseAmt(l.debit);
    const c = parseAmt(l.credit);

    if (!l.account) addLineErr(l.id, "Select an account.");

    if (d > 0 && c > 0) {
      addLineErr(l.id, "A line cannot have both a debit and a credit.");
    }
    if (d === 0 && c === 0) {
      addLineErr(l.id, "Amount is zero — enter a debit or credit.");
    }
    if (d < 0 || c < 0) {
      addLineErr(l.id, "Amounts must be ≥ 0.");
    }
    // Max 2 decimal places
    const check = (v: string) => {
      const parts = v.split(".");
      return !v || (parts[1] ?? "").length <= 2;
    };
    if (!check(l.debit)) addLineErr(l.id, "Debit: max 2 decimal places.");
    if (!check(l.credit)) addLineErr(l.id, "Credit: max 2 decimal places.");
  }

  // UAE VAT warning: for Sales Invoice, if VAT Payable (2100) line exists,
  // warn if it doesn't equal 5% of the revenue line (tolerance AED 0.02).
  if (txType === "sales_invoice") {
    const vatLine = lines.find((l) => l.account?.code === "2100");
    const revLine = lines.find((l) =>
      ["4000", "4100"].includes(l.account?.code ?? ""),
    );
    if (vatLine && revLine) {
      const revAmt = parseAmt(revLine.credit);
      const vatAmt = parseAmt(vatLine.credit);
      const expected = round2(revAmt * 0.05);
      if (Math.abs(vatAmt - expected) > 0.02) {
        warnings.push(
          `VAT line (2100) is ${fmtAED(vatAmt)} but 5% of revenue is ${fmtAED(expected)}. Check the amounts.`,
        );
      }
    }
  }

  return {
    ok: errors.length === 0 && lineErrors.size === 0,
    errors,
    warnings,
    lineErrors,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function JournalEntryEditor({
  journalEntryId,
  aiLines,
  entities,
  detectedIntent,
  userRole,
  userId,
  onSaveDraft,
  onPostToLedger,
  allowPostToLedger = true,
}: Props) {
  const [coa, setCoa] = useState<CoAAccount[]>([]);
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [txType, setTxType] = useState<TransactionType>(intentToTxType(detectedIntent));
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [savePending, startSave] = useTransition();
  const [postPending, startPost] = useTransition();
  const tableRef = useRef<HTMLDivElement>(null);

  const aiDetected = useMemo(() => intentToTxType(detectedIntent), [detectedIntent]);

  // Load CoA once; initialise lines when CoA is ready
  useEffect(() => {
    fetch("/api/chart-of-accounts")
      .then((r) => r.json())
      .then((data: CoAAccount[]) => {
        setCoa(data);
        const byCode = coaByCode(data);
        setLines(initLines(aiLines, byCode));
      })
      .catch(() => {
        setLines(initLines(aiLines, new Map()));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived totals & validation
  const totalDebits = useMemo(
    () => round2(lines.reduce((s, l) => s + parseAmt(l.debit), 0)),
    [lines],
  );
  const totalCredits = useMemo(
    () => round2(lines.reduce((s, l) => s + parseAmt(l.credit), 0)),
    [lines],
  );
  const isBalanced = useMemo(
    () => Math.abs(totalDebits - totalCredits) < 0.005,
    [totalDebits, totalCredits],
  );
  const validation = useMemo(() => validate(lines, txType), [lines, txType]);
  const canPost =
    isBalanced &&
    lines.every((l) => l.account !== null) &&
    !postPending &&
    !savePending;

  // ── Line mutation helpers
  const updateLine = useCallback((id: string, patch: Partial<EditorLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      {
        id: uid(),
        ai_account_code: null, ai_account_id: null, ai_account_name: null,
        ai_debit: 0, ai_credit: 0, ai_memo: "",
        account: null, debit: "", credit: "", memo: "", status: "new_line",
      },
    ]);
    // Focus first input of new row after DOM update
    setTimeout(() => {
      const rows = tableRef.current?.querySelectorAll<HTMLElement>("[data-line-row]");
      const last = rows?.[rows.length - 1];
      last?.querySelector<HTMLElement>("button[role='combobox']")?.focus();
    }, 40);
  }, []);

  const deleteLine = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const resetLine = useCallback(
    (id: string) => {
      const byCode = coaByCode(coa);
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l;
          const account = l.ai_account_code ? (byCode.get(l.ai_account_code) ?? null) : null;
          return {
            ...l,
            account,
            debit: l.ai_debit > 0 ? l.ai_debit.toFixed(2) : "",
            credit: l.ai_credit > 0 ? l.ai_credit.toFixed(2) : "",
            memo: l.ai_memo,
            status: "ai_suggested",
          };
        }),
      );
    },
    [coa],
  );

  // When user changes account, mark as overridden if it differs from AI
  const handleAccountChange = useCallback(
    (id: string, account: CoAAccount | null) => {
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l;
          const changed = account?.code !== l.ai_account_code;
          const status: LineStatus =
            l.status === "new_line"
              ? "new_line"
              : changed
              ? "manually_overridden"
              : l.status === "manually_overridden"
              ? "manually_overridden"
              : "ai_suggested";
          return { ...l, account, status };
        }),
      );
    },
    [],
  );

  // When user changes debit/credit amount, mark as overridden if differs from AI
  const handleAmountChange = useCallback(
    (id: string, field: "debit" | "credit", raw: string) => {
      // Only allow digits and one decimal point, max 2 dp
      const cleaned = raw.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d{0,2}).*$/, "$1");
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l;
          const v = parseAmt(cleaned);
          const aiVal = field === "debit" ? l.ai_debit : l.ai_credit;
          const changed = Math.abs(v - aiVal) > 0.001;
          const status: LineStatus =
            l.status === "new_line"
              ? "new_line"
              : changed
              ? "manually_overridden"
              : l.status;
          return { ...l, [field]: cleaned, status };
        }),
      );
    },
    [],
  );

  // ── Transaction type change: apply default account template to AI-suggested lines
  const handleTxTypeChange = useCallback(
    (type: TransactionType) => {
      setTxType(type);
      const template = TX_TYPE_DEFAULT_ACCOUNTS[type];
      const byCode = coaByCode(coa);

      setLines((prev) => {
        // Only replace AI-suggested lines; leave manually overridden and new lines alone
        const aiLines2 = prev.filter((l) => l.status === "ai_suggested");
        const overriddenLines = prev.filter((l) => l.status !== "ai_suggested");

        const debitLines = template.debitCodes.map((code, i) => {
          const existing = aiLines2[i];
          const account = byCode.get(code) ?? null;
          return existing
            ? { ...existing, account, debit: existing.debit, credit: "" }
            : ({
                id: uid(),
                ai_account_code: code, ai_account_id: account?.id ?? null,
                ai_account_name: account?.name ?? null,
                ai_debit: 0, ai_credit: 0, ai_memo: "",
                account, debit: "", credit: "", memo: "",
                status: "ai_suggested" as LineStatus,
              });
        });

        const creditLines = template.creditCodes.map((code, i) => {
          const idx = template.debitCodes.length + i;
          const existing = aiLines2[idx];
          const account = byCode.get(code) ?? null;
          return existing
            ? { ...existing, account, debit: "", credit: existing.credit }
            : ({
                id: uid(),
                ai_account_code: code, ai_account_id: account?.id ?? null,
                ai_account_name: account?.name ?? null,
                ai_debit: 0, ai_credit: 0, ai_memo: "",
                account, debit: "", credit: "", memo: "",
                status: "ai_suggested" as LineStatus,
              });
        });

        const templateLines =
          template.debitCodes.length > 0 || template.creditCodes.length > 0
            ? [...debitLines, ...creditLines]
            : aiLines2;

        return [...templateLines, ...overriddenLines];
      });
    },
    [coa],
  );

  // ── Feedback collection
  const collectFeedback = useCallback(
    () =>
      lines
        .filter(
          (l) =>
            l.status === "manually_overridden" &&
            l.ai_account_code &&
            l.account?.code &&
            l.ai_account_code !== l.account.code,
        )
        .map((l) => ({
          journal_entry_id: journalEntryId,
          line_id: l.id,
          counterparty: entities.counterparty ?? null,
          description: entities.description ?? null,
          transaction_type: txType,
          ai_suggested_account_code: l.ai_account_code!,
          user_chosen_account_code: l.account!.code,
        })),
    [lines, journalEntryId, entities, txType],
  );

  const sendFeedback = useCallback(async () => {
    const overrides = collectFeedback();
    if (overrides.length === 0) return;
    try {
      await fetch("/api/journal-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
    } catch {
      // Non-critical — don't surface feedback errors to the user
    }
  }, [collectFeedback]);

  const toJournalLines = useCallback(
    (): JournalLine[] =>
      lines.map((l) => ({
        account_code: l.account?.code ?? "",
        account_name: l.account?.name ?? "",
        debit: parseAmt(l.debit),
        credit: parseAmt(l.credit),
        memo: l.memo,
      })),
    [lines],
  );

  const handleSave = () => {
    startSave(async () => {
      try {
        await Promise.all([sendFeedback(), onSaveDraft(toJournalLines())]);
        toast.success("Draft saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save draft");
      }
    });
  };

  const handlePost = () => {
    startPost(async () => {
      try {
        await Promise.all([sendFeedback(), onPostToLedger(toJournalLines())]);
        toast.success("Posted to ledger");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not post to ledger");
      }
    });
  };

  // ── Render
  return (
    <TooltipProvider delayDuration={400}>
      <div className="space-y-4">
        {/* Transaction type */}
        <TransactionTypeSelector
          value={txType}
          aiDetected={aiDetected}
          onChange={handleTxTypeChange}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "edit" | "preview")}>
          <TabsList className="grid w-full grid-cols-2 max-w-xs">
            <TabsTrigger value="edit">Edit Details</TabsTrigger>
            <TabsTrigger value="preview">Journal Preview</TabsTrigger>
          </TabsList>

          {/* ── Edit Details tab ── */}
          <TabsContent value="edit" className="mt-4 space-y-3">
            {/* Validation errors / warnings */}
            {(validation.errors.length > 0 || validation.warnings.length > 0) && (
              <div className="space-y-1">
                {validation.errors.map((msg) => (
                  <p key={msg} className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {msg}
                  </p>
                ))}
                {validation.warnings.map((msg) => (
                  <p key={msg} className="flex items-center gap-1.5 text-sm text-yellow-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {msg}
                  </p>
                ))}
              </div>
            )}

            {/* Lines table */}
            <div className="rounded-md border overflow-x-auto" ref={tableRef}>
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-[260px]">Account</th>
                    <th className="px-3 py-2 text-right font-medium w-32">Debit (AED)</th>
                    <th className="px-3 py-2 text-right font-medium w-32">Credit (AED)</th>
                    <th className="px-3 py-2 text-left font-medium">Memo</th>
                    <th className="px-3 py-2 text-left font-medium w-36">Status</th>
                    <th className="px-2 py-2 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const lineErrs = validation.lineErrors.get(line.id) ?? [];
                    const isLast = idx === lines.length - 1;
                    return (
                      <LineRow
                        key={line.id}
                        line={line}
                        lineErrors={lineErrs}
                        isLast={isLast}
                        coa={coa}
                        userId={userId}
                        userRole={userRole}
                        onAccountChange={(account) => handleAccountChange(line.id, account)}
                        onDebitChange={(v) => handleAmountChange(line.id, "debit", v)}
                        onCreditChange={(v) => handleAmountChange(line.id, "credit", v)}
                        onMemoChange={(v) => updateLine(line.id, { memo: v })}
                        onReset={() => resetLine(line.id)}
                        onDelete={() => deleteLine(line.id)}
                        onEnterLastRow={addLine}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add line */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={addLine}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add line
            </Button>

            {/* Totals */}
            <TotalsRow
              totalDebits={totalDebits}
              totalCredits={totalCredits}
              isBalanced={isBalanced}
            />
          </TabsContent>

          {/* ── Journal Preview tab ── */}
          <TabsContent value="preview" className="mt-4">
            <JournalPreview
              entities={entities}
              lines={lines}
              isBalanced={isBalanced}
              totalDebits={totalDebits}
              totalCredits={totalCredits}
            />
          </TabsContent>
        </Tabs>

        <Separator />

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={savePending}
            onClick={handleSave}
          >
            {savePending ? "Saving…" : "Save Draft"}
          </Button>

          {allowPostToLedger ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={canPost ? -1 : 0} className="inline-flex">
                  <Button
                    type="button"
                    disabled={!canPost || postPending}
                    onClick={handlePost}
                  >
                    {postPending ? "Posting…" : "Post to Ledger"}
                  </Button>
                </span>
              </TooltipTrigger>
              {!canPost && (
                <TooltipContent>
                  {!isBalanced
                    ? "Entry must be balanced before posting."
                    : "All lines need a valid account."}
                </TooltipContent>
              )}
            </Tooltip>
          ) : (
            <p className="text-xs text-muted-foreground">
              Saved drafts can be approved and posted by an accountant from the list below.
            </p>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ─── LineRow ──────────────────────────────────────────────────────────────────

type LineRowProps = {
  line: EditorLine;
  lineErrors: string[];
  isLast: boolean;
  coa: CoAAccount[];
  userId: string;
  userRole: UserRole;
  onAccountChange: (account: CoAAccount | null) => void;
  onDebitChange: (v: string) => void;
  onCreditChange: (v: string) => void;
  onMemoChange: (v: string) => void;
  onReset: () => void;
  onDelete: () => void;
  onEnterLastRow: () => void;
};

function LineRow({
  line,
  lineErrors,
  isLast,
  coa,
  userId,
  userRole,
  onAccountChange,
  onDebitChange,
  onCreditChange,
  onMemoChange,
  onReset,
  onDelete,
  onEnterLastRow,
}: LineRowProps) {
  const hasErr = lineErrors.length > 0;
  const accountErr = lineErrors.some((e) => e.includes("account"));

  return (
    <tr
      data-line-row
      className={cn(
        "border-t transition-colors",
        hasErr && "bg-red-50/40",
      )}
    >
      {/* Account */}
      <td className="px-2 py-1.5">
        <div className="space-y-0.5">
          <AccountPicker
            value={line.account}
            onChange={onAccountChange}
            userId={userId}
            userRole={userRole}
            placeholder="Select account…"
            hasError={accountErr}
            coa={coa}
          />
          {lineErrors
            .filter((e) => e.includes("account"))
            .map((e) => (
              <p key={e} className="text-xs text-destructive">{e}</p>
            ))}
        </div>
      </td>

      {/* Debit */}
      <td className="px-2 py-1.5">
        <AmountInput
          value={line.debit}
          onChange={onDebitChange}
          disabled={parseAmt(line.credit) > 0}
          hasError={lineErrors.some((e) => e.toLowerCase().includes("debit") || e.includes("both") || e.includes("zero"))}
        />
      </td>

      {/* Credit */}
      <td className="px-2 py-1.5">
        <AmountInput
          value={line.credit}
          onChange={onCreditChange}
          disabled={parseAmt(line.debit) > 0}
          hasError={lineErrors.some((e) => e.toLowerCase().includes("credit") || e.includes("both") || e.includes("zero"))}
        />
      </td>

      {/* Memo */}
      <td className="px-2 py-1.5">
        <Input
          className="h-9 text-sm"
          placeholder="Optional note…"
          value={line.memo}
          onChange={(e) => onMemoChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isLast) {
              e.preventDefault();
              onEnterLastRow();
            }
          }}
        />
      </td>

      {/* Status */}
      <td className="px-2 py-1.5">
        <StatusBadge status={line.status} />
      </td>

      {/* Row actions */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          {line.status === "manually_overridden" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={onReset}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset to AI suggestion</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete line</TooltipContent>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
}

// ─── AmountInput ──────────────────────────────────────────────────────────────

function AmountInput({
  value,
  onChange,
  disabled,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}) {
  return (
    <Input
      className={cn(
        "h-9 text-sm text-right tabular-nums w-28",
        disabled && "opacity-40",
        hasError && "border-destructive",
      )}
      inputMode="decimal"
      placeholder="0.00"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
    />
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LineStatus }) {
  if (status === "manually_overridden") {
    return (
      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">
        Manually overridden
      </Badge>
    );
  }
  if (status === "new_line") {
    return (
      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
        New line
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-300">
      AI suggested
    </Badge>
  );
}

// ─── TotalsRow ────────────────────────────────────────────────────────────────

function TotalsRow({
  totalDebits,
  totalCredits,
  isBalanced,
}: {
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}) {
  const diff = round2(Math.abs(totalDebits - totalCredits));
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-2.5 text-sm">
      <span className="font-medium">
        Total Debits:{" "}
        <span className="tabular-nums font-mono">{fmtAED(totalDebits)}</span>
      </span>
      <span className="text-muted-foreground">|</span>
      <span className="font-medium">
        Total Credits:{" "}
        <span className="tabular-nums font-mono">{fmtAED(totalCredits)}</span>
      </span>
      <span className="text-muted-foreground">|</span>
      {isBalanced ? (
        <Badge className="bg-green-100 text-green-800 border-green-300">
          ✓ Balanced
        </Badge>
      ) : (
        <Badge className="bg-red-100 text-red-800 border-red-300">
          Out of balance by {fmtAED(diff)}
        </Badge>
      )}
    </div>
  );
}

// ─── JournalPreview ───────────────────────────────────────────────────────────

function JournalPreview({
  entities,
  lines,
  isBalanced,
  totalDebits,
  totalCredits,
}: {
  entities: EntryEntities;
  lines: EditorLine[];
  isBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
}) {
  const diff = round2(Math.abs(totalDebits - totalCredits));

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4 text-sm">
      {/* Header */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <PreviewField label="Date" value={entities.date} />
        {entities.invoice_number && (
          <PreviewField label="Number" value={entities.invoice_number} />
        )}
        {entities.counterparty && (
          <PreviewField label="Counterparty" value={entities.counterparty} />
        )}
        <PreviewField label="Amount" value={fmtAED(entities.amount)} />
        {entities.tax && (
          <PreviewField
            label={`VAT (${entities.tax.rate}%)`}
            value={entities.tax.amount != null ? fmtAED(entities.tax.amount) : `${entities.tax.rate}%`}
          />
        )}
        {entities.description && (
          <div className="col-span-2">
            <PreviewField label="Description" value={entities.description} />
          </div>
        )}
      </div>

      <Separator />

      {/* Debit / Credit table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="pb-2 text-left font-medium text-muted-foreground">Account</th>
            <th className="pb-2 text-right font-medium text-muted-foreground">Debit</th>
            <th className="pb-2 text-right font-medium text-muted-foreground">Credit</th>
            <th className="pb-2 text-left font-medium text-muted-foreground pl-4">Memo</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b last:border-0">
              <td className="py-1.5">
                {l.account ? (
                  <span>
                    <span className="font-mono text-xs text-muted-foreground mr-1.5">{l.account.code}</span>
                    {l.account.name}
                  </span>
                ) : (
                  <span className="text-muted-foreground italic">No account selected</span>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums font-mono text-xs">
                {parseAmt(l.debit) > 0 ? fmtAED(parseAmt(l.debit)) : ""}
              </td>
              <td className="py-1.5 text-right tabular-nums font-mono text-xs">
                {parseAmt(l.credit) > 0 ? fmtAED(parseAmt(l.credit)) : ""}
              </td>
              <td className="py-1.5 pl-4 text-muted-foreground">{l.memo}</td>
            </tr>
          ))}
          {/* Totals row */}
          <tr className="border-t font-semibold">
            <td className="pt-2">
              {isBalanced ? (
                <Badge className="bg-green-100 text-green-800 border-green-300 font-normal">
                  ✓ Balanced
                </Badge>
              ) : (
                <Badge className="bg-red-100 text-red-800 border-red-300 font-normal">
                  Out of balance by {fmtAED(diff)}
                </Badge>
              )}
            </td>
            <td className="pt-2 text-right tabular-nums font-mono text-xs">{fmtAED(totalDebits)}</td>
            <td className="pt-2 text-right tabular-nums font-mono text-xs">{fmtAED(totalCredits)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground min-w-[90px]">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  JournalEntryEditor,
  type JournalLine,
} from "@/components/journal-entry-editor";
import type { CoAAccount } from "@/components/account-picker";
import {
  approveJournalEntryAction,
  createJournalEntryAction,
  postJournalEntryAction,
  updateJournalEntryAction,
} from "@/lib/actions/journals";
import type { UserRole } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function fetchCoa(): Promise<CoAAccount[]> {
  const res = await fetch("/api/chart-of-accounts");
  if (!res.ok) throw new Error("Failed to load chart of accounts");
  return res.json();
}

function toPayload(
  lines: JournalLine[],
  coa: CoAAccount[],
): Array<{ account_id: string; debit: number; credit: number; memo: string | null }> {
  const byCode = new Map(coa.map((a) => [a.code, a.id]));
  return lines.map((l) => {
    const account_id = byCode.get(l.account_code);
    if (!account_id) {
      throw new Error(`Unknown account code: ${l.account_code}`);
    }
    return {
      account_id,
      debit: Number(l.debit.toFixed(2)),
      credit: Number(l.credit.toFixed(2)),
      memo: l.memo?.trim() ? l.memo : null,
    };
  });
}

export function JournalAiAssistantSection({
  userId,
  userRole,
  canPostToLedger,
}: {
  userId: string;
  userRole: UserRole;
  canPostToLedger: boolean;
}) {
  const router = useRouter();
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  /** Stable until first DB insert — used for journal-feedback line correlation. */
  const [journalEntryIdForFeedback, setJournalEntryIdForFeedback] = useState(
    () => `pending-${crypto.randomUUID()}`,
  );

  const entities = useMemo(
    () => ({
      date: new Date().toISOString().slice(0, 10),
      counterparty: null as string | null,
      description: "Manual journal (AI-assisted)",
      amount: 0,
      currency: "AED",
      invoice_number: null as string | null,
      tax: null as { rate: number; amount: number | null } | null,
    }),
    [],
  );

  const persistLines = async (lines: JournalLine[]) => {
    const coa = await fetchCoa();
    const payloadLines = toPayload(lines, coa);

    if (savedEntryId) {
      await updateJournalEntryAction({
        entryId: savedEntryId,
        date: entities.date,
        description: entities.description ?? "",
        lines: payloadLines,
      });
      return savedEntryId;
    }

    const id = await createJournalEntryAction({
      date: entities.date,
      description: entities.description ?? "",
      lines: payloadLines,
    });
    setSavedEntryId(id);
    setJournalEntryIdForFeedback(id);
    return id;
  };

  const onSaveDraft = async (lines: JournalLine[]) => {
    await persistLines(lines);
    router.refresh();
  };

  const onPostToLedger = async (lines: JournalLine[]) => {
    const entryId = await persistLines(lines);

    if (canPostToLedger) {
      await approveJournalEntryAction({ entryId });
      await postJournalEntryAction({ entryId });
    }

    router.refresh();
    router.push(`/journals?entryId=${entryId}`);
  };

  if (!userId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI-assisted journal entry</CardTitle>
        <CardDescription>
          Override AI-suggested accounts before posting. Feedback on overrides is saved for future prompt
          improvements ({canPostToLedger ? "you can approve and post" : "draft only — an approver posts"}).
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        <JournalEntryEditor
          journalEntryId={journalEntryIdForFeedback}
          aiLines={[]}
          entities={entities}
          detectedIntent=""
          userRole={userRole}
          userId={userId}
          onSaveDraft={onSaveDraft}
          onPostToLedger={onPostToLedger}
          allowPostToLedger={canPostToLedger}
        />
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatCurrency } from "@/lib/format";
import { formatCoaAccountLabel } from "@/lib/drafts/account-display";
import type { JournalEntryWithLines } from "@/lib/data/journals";
import { approveJournalEntryAction, postJournalEntryAction, deleteJournalEntryAction } from "@/lib/actions/journals";
import { canApprove, type UserRole } from "@/lib/auth";
import { toast } from "sonner";
import { Check, Pencil, Trash2 } from "lucide-react";

type FilterParams = {
  startDate?: string;
  endDate?: string;
  accountCode?: string;
  search?: string;
  status?: string;
  entryId?: string;
};

type Props = {
  entries: JournalEntryWithLines[];
  accounts: Array<{ id: string; code: string; name: string }>;
  userRole: string | null;
  highlightedEntryId?: string;
  filterParams?: FilterParams;
};

function buildEditHref(entryId: string, filterParams?: FilterParams): string {
  const params = new URLSearchParams();
  if (filterParams?.startDate) params.set("startDate", filterParams.startDate);
  if (filterParams?.endDate) params.set("endDate", filterParams.endDate);
  if (filterParams?.accountCode) params.set("accountCode", filterParams.accountCode);
  if (filterParams?.search) params.set("search", filterParams.search);
  if (filterParams?.status) params.set("status", filterParams.status);
  params.set("edit", entryId);
  return `/journals?${params.toString()}`;
}

export function JournalEntriesTable({
  entries,
  accounts,
  userRole,
  highlightedEntryId,
  filterParams,
}: Props) {
  const router = useRouter();
  const highlightedRef = useRef<HTMLTableRowElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightedEntryId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedEntryId]);

  const canApproveEntries = canApprove((userRole ?? "business_user") as UserRole);

  const handleApprove = async (entryId: string) => {
    setApprovingId(entryId);
    try {
      await approveJournalEntryAction({ entryId });
      toast.success("Journal entry approved. Post to ledger when ready.");
      router.refresh();
    } catch (e) {
      toast.error("Failed to approve", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handlePost = async (entryId: string) => {
    setPostingId(entryId);
    try {
      await postJournalEntryAction({ entryId });
      toast.success("Posted to ledger.");
      router.refresh();
    } catch (e) {
      toast.error("Failed to post", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setPostingId(null);
    }
  };

  const handleDeleteClick = (id: string) => setDeletingId(id);
  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    try {
      await deleteJournalEntryAction({ entryId: deletingId });
      toast.success("Draft deleted.");
      setDeletingId(null);
      router.refresh();
    } catch (e) {
      toast.error("Failed to delete", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Journal Entries</h3>
        <p className="text-sm text-muted-foreground">
          {entries.length} entr{entries.length !== 1 ? "ies" : "y"} matching filters. Draft → Approve → Post.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  No journal entries match. Create one above or adjust filters.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => {
                const totalDebit = entry.journal_lines.reduce(
                  (sum, line) => sum + Number(line.debit),
                  0,
                );
                const isHighlighted = highlightedEntryId === entry.id;
                const isDraft = entry.status === "draft";
                const isApproved = entry.status === "approved";
                const canApproveThis = isDraft && canApproveEntries;
                const canPostThis = isApproved && canApproveEntries;
                const canDeleteThis = isDraft;
                return (
                  <TableRow
                    key={entry.id}
                    ref={isHighlighted ? highlightedRef : undefined}
                    data-entry-id={entry.id}
                    className={isHighlighted ? "bg-muted/60" : undefined}
                  >
                    <TableCell className="text-sm">{formatDate(entry.date)}</TableCell>
                    <TableCell className="max-w-md">{entry.description}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {entry.journal_lines.map((line, idx) => {
                          const account = accounts.find((a) => a.id === line.account_id);
                          const accountLabel = account
                            ? formatCoaAccountLabel(account.code, account.name)
                            : "Unknown Account";
                          return (
                            <div key={idx} className="text-xs text-muted-foreground">
                              {accountLabel}:{" "}
                              {Number(line.debit) > 0 ? (
                                <span className="text-green-600">
                                  DR {formatCurrency(Number(line.debit), "AED")}
                                </span>
                              ) : (
                                <span className="text-blue-600">
                                  CR {formatCurrency(Number(line.credit), "AED")}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          isDraft ? "secondary" : isApproved ? "outline" : "default"
                        }
                      >
                        {isDraft ? "Draft" : isApproved ? "Approved" : entry.status === "void" ? "Void" : "Posted"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(totalDebit, "AED")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canApproveThis && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApprove(entry.id)}
                            disabled={!!approvingId || !!postingId}
                            title="Approve for posting"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            {approvingId === entry.id ? "Approving…" : "Approve"}
                          </Button>
                        )}
                        {canPostThis && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handlePost(entry.id)}
                            disabled={!!postingId || !!approvingId}
                            title="Post to ledger"
                          >
                            {postingId === entry.id ? "Posting…" : "Post"}
                          </Button>
                        )}
                        {canDeleteThis && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              title="Edit draft"
                            >
                              <Link href={buildEditHref(entry.id, filterParams)}>
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(entry.id)}
                              title="Delete draft"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete draft</DialogTitle>
            <DialogDescription>
              This draft will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

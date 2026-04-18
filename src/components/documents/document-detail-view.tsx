"use client";

import Link from "next/link";
import { Copy, FileDown } from "lucide-react";
import { toast } from "sonner";

import { DocumentWorkflowBadge, type WorkflowUiStatus } from "@/components/documents/document-workflow-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Props = {
  breadcrumbListHref: string;
  breadcrumbListLabel: string;
  documentNumber: string | null;
  documentTitle: string;
  status: WorkflowUiStatus;
  pdfHref: string;
  journalEntryId: string;
  /** e.g. "invoice", "bill", "payment" for audit stub copy */
  entityLabel: string;
};

export function DocumentDetailView({
  breadcrumbListHref,
  breadcrumbListLabel,
  documentNumber,
  documentTitle,
  status,
  pdfHref,
  journalEntryId,
  entityLabel,
}: Props) {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(typeof window !== "undefined" ? window.location.href : "");
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href={breadcrumbListHref} className="hover:text-foreground hover:underline">
          {breadcrumbListLabel}
        </Link>
        <span className="mx-2">/</span>
        <span className="font-mono text-foreground">{documentNumber ?? "—"}</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{documentTitle}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{documentNumber ?? "—"}</span>
            <DocumentWorkflowBadge status={status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={pdfHref} target="_blank" rel="noreferrer">
              <FileDown className="h-4 w-4" />
              PDF
            </a>
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={() => void copyLink()}>
            <Copy className="h-4 w-4" />
            Copy link
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Linked entries</CardTitle>
          <CardDescription>Journal, settlements, and audit references for this {entityLabel}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Journal entry </span>
            <Link
              href={`/journals?entryId=${journalEntryId}`}
              className="font-mono text-primary underline-offset-4 hover:underline"
            >
              Open in GL
            </Link>
          </div>
          <Separator />
          <p className="text-muted-foreground">
            Attached payments, credit/debit notes, and full audit trail will appear here as those features expand.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

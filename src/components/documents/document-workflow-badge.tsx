"use client";

import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type WorkflowUiStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "posted"
  | "voided"
  | "reversed"
  | "overdue";

const label: Record<WorkflowUiStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  posted: "Posted",
  voided: "Voided",
  reversed: "Reversed",
  overdue: "Overdue",
};

export function DocumentWorkflowBadge({
  status,
  className,
  reversedByDoc,
}: {
  status: WorkflowUiStatus;
  className?: string;
  /** Shown as tooltip when status is reversed */
  reversedByDoc?: string | null;
}) {
  const base = "font-normal";
  const inner =
    status === "draft" ? (
      <Badge variant="outline" className={cn("border-muted-foreground/40 text-muted-foreground", base, className)}>
        {label[status]}
      </Badge>
    ) : status === "pending_approval" ? (
      <Badge className={cn("bg-amber-500 text-white hover:bg-amber-500/90", base, className)}>{label[status]}</Badge>
    ) : status === "approved" ? (
      <Badge className={cn("bg-blue-600 text-white hover:bg-blue-600/90", base, className)}>{label[status]}</Badge>
    ) : status === "posted" ? (
      <Badge className={cn("bg-slate-900 text-white hover:bg-slate-900/90 gap-1", base, className)}>
        <Lock className="h-3 w-3" aria-hidden />
        {label[status]}
      </Badge>
    ) : status === "voided" ? (
      <Badge variant="secondary" className={cn("text-muted-foreground line-through decoration-muted-foreground/60", base, className)}>
        {label[status]}
      </Badge>
    ) : status === "reversed" ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className={cn(base, className)}>
              {label[status]}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {reversedByDoc ? `Reversed by ${reversedByDoc}` : "Reversed document"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : (
      <Badge
        variant="outline"
        className={cn("border-destructive/60 text-destructive", base, className)}
      >
        {label[status]}
      </Badge>
    );

  return inner;
}

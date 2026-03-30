"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateAccountingPeriodCloseAction } from "@/lib/actions/tenant";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const schema = z.object({
  closed_through: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  defaultClosedThrough: string | null;
};

export function PeriodCloseForm({ defaultClosedThrough }: Props) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      closed_through: defaultClosedThrough ?? "",
    },
  });

  const onSubmit = (values: FormValues) => {
    const raw = values.closed_through?.trim() ?? "";
    const accounting_period_closed_through = raw === "" ? null : raw;
    if (accounting_period_closed_through !== null && !/^\d{4}-\d{2}-\d{2}$/.test(accounting_period_closed_through)) {
      toast.error("Use a valid date (YYYY-MM-DD).");
      return;
    }

    startTransition(async () => {
      try {
        await updateAccountingPeriodCloseAction({ accounting_period_closed_through });
        toast.success(
          accounting_period_closed_through
            ? `Books closed through ${accounting_period_closed_through}. Posting is blocked on or before that date.`
            : "Period lock cleared. All open dates can be posted.",
        );
      } catch (error) {
        console.error(error);
        toast.error("Failed to update period close", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    });
  };

  const clearLock = () => {
    form.setValue("closed_through", "");
    startTransition(async () => {
      try {
        await updateAccountingPeriodCloseAction({ accounting_period_closed_through: null });
        toast.success("Period lock cleared.");
      } catch (error) {
        console.error(error);
        toast.error("Failed to clear period lock", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    });
  };

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Only <strong>admin</strong> can change this. Entries with transaction date on or before the closed-through
          date cannot be posted (drafts, manual journals, and automated depreciation/disposal runs).
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label htmlFor="closed_through" className="text-sm font-medium">
            Close books through
          </label>
          <Input
            id="closed_through"
            type="date"
            {...form.register("closed_through")}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty and save to allow all dates, or use &quot;Clear lock&quot;.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={clearLock} disabled={isPending}>
            Clear lock
          </Button>
          <Button type="submit" disabled={isPending}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate } from "@/lib/format";
import { updateTenantSubscriptionAction } from "@/lib/actions/subscriptions";
import { toast } from "sonner";

type SubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  monthly_prompt_limit: number | null;
  monthly_bank_upload_limit: number | null;
  seat_limit: number | null;
};

type TenantSubscription = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: "trialing" | "active" | "past_due" | "cancelled";
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at: string | null;
  plan?: SubscriptionPlan | null;
};

type Usage = {
  promptCount: number;
  bankUploadCount: number;
  periodStart: string;
  periodEnd: string;
} | null;

type Props = {
  plans: SubscriptionPlan[];
  subscription: TenantSubscription | null;
  usage: Usage;
  canManage: boolean;
};

export function SubscriptionManager({ plans, subscription, usage, canManage }: Props) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(subscription?.plan_id ?? plans[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  // Initialize selected plan when subscription or plans change
  useEffect(() => {
    // Use a small delay to avoid cascading renders
    const timeoutId = setTimeout(() => {
      if (subscription?.plan_id) {
        setSelectedPlanId(subscription.plan_id);
      } else if (plans[0]?.id) {
        setSelectedPlanId(plans[0].id);
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [subscription?.plan_id, plans]);

  const activePlan = useMemo(() => {
    const resolved = plans.find((plan) => plan.id === selectedPlanId);
    return resolved ?? subscription?.plan ?? null;
  }, [plans, selectedPlanId, subscription?.plan]);

  const currentStatus = subscription?.status ?? "trialing";
  const statusVariant =
    currentStatus === "active"
      ? "secondary"
      : currentStatus === "past_due"
        ? "destructive"
        : currentStatus === "cancelled"
          ? "outline"
          : "default";

  const onUpdatePlan = () => {
    if (!selectedPlanId) {
      toast.error("Select a plan to continue.");
      return;
    }

    startTransition(async () => {
      try {
        await updateTenantSubscriptionAction({ planId: selectedPlanId });
        toast.success("Subscription updated");
      } catch (error) {
        console.error(error);
        toast.error("Failed to update subscription", {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>Manage your billing plan and monitor monthly usage.</CardDescription>
          </div>
          <Badge variant={statusVariant} className="uppercase tracking-wide">
            {currentStatus}
          </Badge>
        </div>
        {subscription?.current_period_start && subscription?.current_period_end ? (
          <p className="text-xs text-muted-foreground">
            Billing period {formatDate(subscription.current_period_start)} –{" "}
            {formatDate(subscription.current_period_end)}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Current plan</label>
            <Select
              value={selectedPlanId}
              onValueChange={setSelectedPlanId}
              disabled={!canManage || plans.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}{" "}
                    {plan.price_cents > 0
                      ? `· ${formatCurrency(plan.price_cents / 100, plan.currency)} / month`
                      : "· Contact sales"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {activePlan ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{activePlan.name}</p>
              {activePlan.description ? <p className="mt-1">{activePlan.description}</p> : null}
              <Separator className="my-3" />
              <ul className="space-y-1">
                <li>
                  Prompts:{" "}
                  {activePlan.monthly_prompt_limit
                    ? `${activePlan.monthly_prompt_limit.toLocaleString()} / month`
                    : "Unlimited"}
                </li>
                <li>
                  Bank uploads:{" "}
                  {activePlan.monthly_bank_upload_limit
                    ? `${activePlan.monthly_bank_upload_limit.toLocaleString()} / month`
                    : "Unlimited"}
                </li>
                <li>
                  Seats: {activePlan.seat_limit ? activePlan.seat_limit : "Unlimited"}
                </li>
              </ul>
            </div>
          ) : null}
        </div>

        {usage ? (
          <div className="rounded-lg border p-4">
            <p className="text-sm font-semibold text-foreground">This month&apos;s usage</p>
            <p className="text-xs text-muted-foreground">
              Tracking window {formatDate(usage.periodStart)} – {formatDate(usage.periodEnd)}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <UsageStat
                label="Prompts"
                used={usage.promptCount}
                limit={activePlan?.monthly_prompt_limit ?? null}
              />
              <UsageStat
                label="Bank uploads"
                used={usage.bankUploadCount}
                limit={activePlan?.monthly_bank_upload_limit ?? null}
              />
            </div>
          </div>
        ) : null}

        {canManage ? (
          <Button onClick={onUpdatePlan} disabled={isPending || !selectedPlanId}>
            {isPending ? "Updating..." : "Update Plan"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Contact an administrator to change the subscription plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function UsageStat({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const limitLabel = limit ? limit.toLocaleString() : "∞";
  const percentage = limit ? Math.min(100, Math.round((used / limit) * 100)) : null;
  return (
    <div className="space-y-1 rounded-md border bg-background p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{used.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">
        Limit {limitLabel}
        {percentage !== null ? ` (${percentage}% used)` : ""}
      </p>
    </div>
  );
}


"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateInventoryValuationMethodAction } from "@/lib/actions/accounting-policies";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Info } from "lucide-react";
import type { AccountingPolicy } from "@/lib/data/tenant";

type Props = {
  policy: AccountingPolicy | null;
  hasInventoryTransactions: boolean;
};

export function AccountingPoliciesForm({ policy, hasInventoryTransactions }: Props) {
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    valuation_method: policy?.inventory_valuation_method || "fifo",
    effective_date: policy?.effective_date || new Date().toISOString().split("T")[0],
    reason: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateInventoryValuationMethodAction(formData);
        toast.success("Inventory valuation method updated successfully");
        setFormData((prev) => ({ ...prev, reason: "" }));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update valuation method"
        );
      }
    });
  };

  const isBlocked = hasInventoryTransactions;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Inventory Valuation Method</h3>
          <p className="text-sm text-muted-foreground mb-4">
            The valuation method applies consistently to all inventory items. This is a
            company-level accounting policy, not a product attribute.
          </p>
        </div>

        {isBlocked && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Cannot change valuation method after inventory transactions exist. This would
              require revaluation of all existing inventory balances.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="valuation_method">Valuation Method *</Label>
          <Select
            value={formData.valuation_method}
            onValueChange={(value: "fifo" | "weighted_average") =>
              setFormData({ ...formData, valuation_method: value })
            }
            disabled={isBlocked}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fifo">FIFO (First-In, First-Out)</SelectItem>
              <SelectItem value="weighted_average">Weighted Average</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {isBlocked
              ? "Change blocked: Inventory transactions exist"
              : "This method will apply to all inventory items"}
          </p>
        </div>

        {!isBlocked && (
          <>
            <div className="space-y-2">
              <Label htmlFor="effective_date">Effective Date</Label>
              <Input
                id="effective_date"
                type="date"
                value={formData.effective_date}
                onChange={(e) =>
                  setFormData({ ...formData, effective_date: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Date from which this valuation method applies
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Change *</Label>
              <Textarea
                id="reason"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Explain why you are changing the valuation method..."
                rows={4}
                required
                minLength={10}
              />
              <p className="text-xs text-muted-foreground">
                A reason is required for audit purposes (minimum 10 characters)
              </p>
            </div>
          </>
        )}

        {policy && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Current setting: <strong>{policy.inventory_valuation_method === "fifo" ? "FIFO" : "Weighted Average"}</strong> (effective {new Date(policy.effective_date).toLocaleDateString()})
            </AlertDescription>
          </Alert>
        )}
      </div>

      {!isBlocked && (
        <Button type="submit" disabled={isPending || !formData.reason || formData.reason.length < 10}>
          {isPending ? "Updating..." : "Update Valuation Method"}
        </Button>
      )}
    </form>
  );
}


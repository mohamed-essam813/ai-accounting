"use client";

import { useTransition, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createAccountAction } from "@/lib/actions/accounts";
import { toast } from "sonner";
import { determineCategoryFromCode } from "@/lib/accounting/determine-category";
import { AlertCircle } from "lucide-react";

const schema = z.object({
  name: z.string().min(3),
  code: z.string().min(3).optional(),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  category: z.enum(["current", "non_current"]).nullable().optional(),
  detail_type: z.enum(["bank", "cash", "other_current_asset", "fixed_asset", "other"]).nullable().optional(),
}).refine(
  (data) => {
    // Require detail_type for asset accounts
    if (data.type === "asset" && !data.detail_type) {
      return false;
    }
    return true;
  },
  {
    message: "Subtype is required for Asset accounts",
    path: ["detail_type"],
  }
);

type FormValues = z.infer<typeof schema>;

export function AccountForm() {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      code: "",
      type: "asset",
      category: null,
      detail_type: null,
    },
  });

  const selectedType = form.watch("type");
  const enteredCode = form.watch("code");
  const enteredName = form.watch("name");
  const selectedDetailType = form.watch("detail_type");
  
  // Check for bank-like keywords in name
  const bankKeywords = ["bank", "enbd", "adcb", "adib", "fgb", "rakbank", "cbd", "mashreq"];
  const hasBankKeywords = bankKeywords.some((keyword) =>
    enteredName.toLowerCase().includes(keyword.toLowerCase())
  );
  const showBankWarning = hasBankKeywords && selectedType === "asset" && selectedDetailType !== "bank";

  // Auto-determine category from code when code is entered
  useEffect(() => {
    if (enteredCode && enteredCode.length >= 4 && (selectedType === "asset" || selectedType === "liability")) {
      const category = determineCategoryFromCode(enteredCode, selectedType);
      if (category && form.getValues("category") !== category) {
        form.setValue("category", category, { shouldValidate: false });
      }
    }
  }, [enteredCode, selectedType, form]);

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        await createAccountAction(values);
        toast.success("Account created");
        form.reset({
          name: "",
          code: "",
          type: "asset",
          category: null,
          detail_type: null,
        });
      } catch (error) {
        console.error(error);
        toast.error("Failed to create account", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    });
  };

  const showCategory = selectedType === "asset" || selectedType === "liability";
  const showDetailType = selectedType === "asset";

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      {showBankWarning && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This looks like a bank account. Bank accounts must be created as type &quot;Bank&quot; to support reconciliation.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-4">
      <div className="md:col-span-1">
        <label className="text-sm font-medium mb-1.5 block">Name</label>
        <Input placeholder="e.g., Accounts Receivable" {...form.register("name")} />
        {form.formState.errors.name ? (
          <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>
        ) : null}
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium mb-1.5 block">Code</label>
        <Input placeholder="1100" {...form.register("code")} />
        {form.formState.errors.code ? (
          <p className="text-xs text-destructive mt-1">{form.formState.errors.code.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            Leave empty to auto-generate
          </p>
        )}
      </div>
      <div className="md:col-span-1">
        <label className="text-sm font-medium mb-1.5 block">Type</label>
        <Select
          onValueChange={(value) => {
            form.setValue("type", value as FormValues["type"]);
            // Reset category when type changes (unless it's still asset/liability)
            if (value !== "asset" && value !== "liability") {
              form.setValue("category", null);
            }
          }}
          value={form.getValues("type")}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asset">Asset</SelectItem>
            <SelectItem value="liability">Liability</SelectItem>
            <SelectItem value="equity">Equity</SelectItem>
            <SelectItem value="revenue">Revenue</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showCategory ? (
        <div className="md:col-span-1">
          <label className="text-sm font-medium mb-1.5 block">Category</label>
          <Select
            onValueChange={(value) => {
              form.setValue("category", value as "current" | "non_current", { shouldValidate: true });
            }}
            value={form.watch("category") || undefined}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="non_current">Non-Current</SelectItem>
            </SelectContent>
          </Select>
          {form.watch("category") && (
            <p className="text-xs text-muted-foreground mt-1">
              {form.watch("category") === "current" && "Short-term (within 1 year)"}
              {form.watch("category") === "non_current" && "Long-term (over 1 year)"}
            </p>
          )}
        </div>
      ) : (
        <div className="md:col-span-1" />
      )}
      {showDetailType ? (
        <div className="md:col-span-1">
          <label className="text-sm font-medium mb-1.5 block">Subtype</label>
          <Select
            onValueChange={(value) => {
              form.setValue("detail_type", value as FormValues["detail_type"], { shouldValidate: true });
            }}
            value={form.watch("detail_type") || undefined}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select subtype" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="other_current_asset">Other Current Asset</SelectItem>
              <SelectItem value="fixed_asset">Fixed Asset</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          {!form.watch("detail_type") && (
            <p className="text-xs text-muted-foreground mt-1">
              Is this a Bank Account or another type of Asset?
            </p>
          )}
          {form.formState.errors.detail_type ? (
            <p className="text-xs text-destructive mt-1">
              {form.formState.errors.detail_type.message}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="md:col-span-1" />
      )}
      </div>
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Account"}
        </Button>
      </div>
    </form>
  );
}


"use client";

import { useTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createAccountAction } from "@/lib/actions/accounts";
import { toast } from "sonner";
import { determineCategoryFromCode } from "@/lib/accounting/determine-category";

const schema = z.object({
  name: z.string().min(3),
  code: z.string().min(3).optional(),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  category: z.enum(["current", "non_current"]).nullable().optional(),
});

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
    },
  });

  const selectedType = form.watch("type");
  const enteredCode = form.watch("code");

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

  return (
    <form className="grid gap-4 md:grid-cols-4" onSubmit={form.handleSubmit(onSubmit)}>
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
      <div className="md:col-span-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Account"}
        </Button>
      </div>
    </form>
  );
}


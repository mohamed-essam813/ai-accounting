"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createAccountAction } from "@/lib/actions/accounts";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(3),
  code: z.string().min(3),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
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
    },
  });

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        await createAccountAction(values);
        toast.success("Account created");
        form.reset({ ...values, name: "", code: "" });
      } catch (error) {
        console.error(error);
        toast.error("Failed to create account", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    });
  };

  return (
    <form className="grid gap-4 md:grid-cols-3" onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <label className="text-sm font-medium">Name</label>
        <Input placeholder="Accounts Receivable" {...form.register("name")} />
        {form.formState.errors.name ? (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium">Code</label>
        <Input placeholder="1100" {...form.register("code")} />
        {form.formState.errors.code ? (
          <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium">Type</label>
        <Select
          onValueChange={(value) => form.setValue("type", value as FormValues["type"])}
          defaultValue={form.getValues("type")}
        >
          <SelectTrigger>
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
      <div className="md:col-span-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Account"}
        </Button>
      </div>
    </form>
  );
}


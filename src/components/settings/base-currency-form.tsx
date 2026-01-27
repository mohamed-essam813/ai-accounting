"use client";

import { useTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { updateTenantBaseCurrencyAction } from "@/lib/actions/tenant";
import { toast } from "sonner";
import { getAllCurrencies } from "@/lib/currencies";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const schema = z.object({
  base_currency: z.string().min(3, "Currency code required"),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  defaultBaseCurrency: string;
  hasTransactions: boolean;
};

export function BaseCurrencyForm({ defaultBaseCurrency, hasTransactions }: Props) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { base_currency: defaultBaseCurrency },
  });

  const currencies = getAllCurrencies();

  const onSubmit = (values: FormValues) => {
    if (hasTransactions) {
      const confirmed = window.confirm(
        "Changing base currency does not rewrite historical transaction currencies; it only changes system default and reporting base. Continue?"
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      try {
        await updateTenantBaseCurrencyAction(values);
        toast.success("Base currency updated");
      } catch (error) {
        console.error(error);
        toast.error("Failed to update base currency", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    });
  };

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      {hasTransactions && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Changing base currency does not rewrite historical transaction currencies; it only
            changes system default and reporting base.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-end gap-4">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium">Base Currency</label>
          <Select
            value={form.watch("base_currency")}
            onValueChange={(value) => form.setValue("base_currency", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select base currency" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {currencies.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Default currency for reporting and currency filter. Used when no currency is selected.
          </p>
          {form.formState.errors.base_currency ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.base_currency.message}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateTenantCompanyDetailsAction } from "@/lib/actions/tenant";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  country: z.string().optional(),
  fiscal_year_start_month: z.number().min(1).max(12).nullable().optional(),
  tax_registration_number: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  defaultCountry: string;
  defaultFiscalMonth: number | null;
  defaultTaxReg: string;
};

const MONTHS = [
  { v: "1", label: "January" },
  { v: "2", label: "February" },
  { v: "3", label: "March" },
  { v: "4", label: "April" },
  { v: "5", label: "May" },
  { v: "6", label: "June" },
  { v: "7", label: "July" },
  { v: "8", label: "August" },
  { v: "9", label: "September" },
  { v: "10", label: "October" },
  { v: "11", label: "November" },
  { v: "12", label: "December" },
];

export function CompanyDetailsForm({
  defaultCountry,
  defaultFiscalMonth,
  defaultTaxReg,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      country: defaultCountry,
      fiscal_year_start_month: defaultFiscalMonth,
      tax_registration_number: defaultTaxReg,
    },
  });

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        await updateTenantCompanyDetailsAction({
          country: values.country?.trim() || null,
          fiscal_year_start_month: values.fiscal_year_start_month ?? null,
          tax_registration_number: values.tax_registration_number?.trim() || null,
        });
        toast.success("Company details saved");
      } catch (error) {
        console.error(error);
        toast.error("Failed to save", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    });
  };

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Country</label>
          <Input {...form.register("country")} placeholder="e.g. United Arab Emirates" disabled={isPending} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Tax registration (VAT / TRN)</label>
          <Input
            {...form.register("tax_registration_number")}
            placeholder="Tax ID"
            disabled={isPending}
          />
        </div>
      </div>
      <div className="space-y-2 max-w-xs">
        <label className="text-sm font-medium">Fiscal year starts (month)</label>
        <Controller
          control={form.control}
          name="fiscal_year_start_month"
          render={({ field }) => (
            <Select
              value={field.value == null ? "none" : String(field.value)}
              onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {MONTHS.map((m) => (
                  <SelectItem key={m.v} value={m.v}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <p className="text-xs text-muted-foreground">
          Used for reporting periods aligned to your fiscal year (PRD company setup).
        </p>
      </div>
      <Button type="submit" disabled={isPending}>
        Save company details
      </Button>
    </form>
  );
}

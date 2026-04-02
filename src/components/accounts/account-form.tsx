"use client";

import { useTransition, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createAccountAction } from "@/lib/actions/accounts";
import { toast } from "sonner";
import { determineCategoryFromCode } from "@/lib/accounting/determine-category";
import { AlertCircle } from "lucide-react";
import {
  ACCOUNT_PURPOSE_OPTIONS,
  type AccountPurposeId,
  purposeToCreateAccountPayload,
  purposeToAccountClassification,
} from "@/lib/accounting/account-purpose-mapping";
import {
  PNL_CLASSIFICATION_LABEL,
  pnlClassificationOptionsForType,
} from "@/lib/accounting/account-classification";

const prdKindEnum = z.enum([
  "bank",
  "cash",
  "accounts_receivable",
  "accounts_payable",
  "inventory",
  "fixed_asset",
  "revenue",
  "expense",
  "equity",
  "tax",
  "other",
]);

const advancedSchema = z.object({
  name: z.string().min(3),
  code: z.string().min(3).optional(),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  category: z.enum(["current", "non_current"]).nullable().optional(),
  detail_type: z.enum(["bank", "cash", "other_current_asset", "fixed_asset", "other"]).nullable().optional(),
  prd_account_kind: prdKindEnum.optional(),
  /** When set, stored as explicit P&L grouping (overrides type defaults). */
  account_classification: z
    .enum(["revenue", "cost_of_sales", "operating_expense", "other_income", "other_expense"])
    .optional(),
}).refine(
  (data) => {
    if (data.type === "asset" && !data.detail_type) {
      return false;
    }
    return true;
  },
  {
    message: "Subtype is required for Asset accounts",
    path: ["detail_type"],
  },
);

type AdvancedFormValues = z.infer<typeof advancedSchema>;

const purposeEnum = z.enum([
  "bank",
  "cash",
  "accounts_receivable",
  "accounts_payable",
  "inventory",
  "equipment",
  "income",
  "expense",
  "tax",
  "other",
]);

const simpleSchema = z
  .object({
    name: z.string().min(3, "Enter a name (at least 3 characters)"),
    purpose: purposeEnum.optional(),
    equipmentOverOneYear: z.enum(["yes", "no"]).optional(),
    code: z.string().optional(),
  })
  .refine((data) => data.purpose != null, {
    message: "Choose what this account is used for",
    path: ["purpose"],
  })
  .refine(
    (data) => {
      if (data.purpose === "equipment") {
        return data.equipmentOverOneYear === "yes" || data.equipmentOverOneYear === "no";
      }
      return true;
    },
    {
      message: "Choose whether this asset is used for more than one year",
      path: ["equipmentOverOneYear"],
    },
  )
  .refine(
    (data) => {
      const c = data.code?.trim();
      return !c || c.length >= 3;
    },
    { message: "Use at least 3 characters or leave the code blank for auto-generation", path: ["code"] },
  );

type SimpleFormValues = z.infer<typeof simpleSchema>;

export function AccountForm() {
  const [isPending, startTransition] = useTransition();
  const [advancedMode, setAdvancedMode] = useState(false);

  const simpleForm = useForm<SimpleFormValues>({
    resolver: zodResolver(simpleSchema),
    defaultValues: {
      name: "",
      purpose: undefined,
      equipmentOverOneYear: undefined,
      code: "",
    },
  });

  const advancedForm = useForm<AdvancedFormValues>({
    resolver: zodResolver(advancedSchema),
    defaultValues: {
      name: "",
      code: "",
      type: "asset",
      category: null,
      detail_type: null,
      prd_account_kind: undefined,
      account_classification: undefined,
    },
  });

  const selectedType = advancedForm.watch("type");
  const enteredCode = advancedForm.watch("code");
  const enteredName = advancedForm.watch("name");
  const selectedDetailType = advancedForm.watch("detail_type");
  const purposeWatch = simpleForm.watch("purpose");

  const bankKeywords = ["bank", "enbd", "adcb", "adib", "fgb", "rakbank", "cbd", "mashreq"];
  const hasBankKeywords = bankKeywords.some((keyword) =>
    enteredName.toLowerCase().includes(keyword.toLowerCase()),
  );
  const showBankWarning =
    advancedMode &&
    hasBankKeywords &&
    selectedType === "asset" &&
    selectedDetailType !== "bank";

  useEffect(() => {
    if (enteredCode && enteredCode.length >= 4 && (selectedType === "asset" || selectedType === "liability")) {
      const category = determineCategoryFromCode(enteredCode, selectedType);
      if (category && advancedForm.getValues("category") !== category) {
        advancedForm.setValue("category", category, { shouldValidate: false });
      }
    }
  }, [enteredCode, selectedType, advancedForm]);

  const onSubmitSimple = (values: SimpleFormValues) => {
    startTransition(async () => {
      try {
        const purpose = values.purpose! as AccountPurposeId;
        const equipmentOverOneYear =
          purpose === "equipment" ? values.equipmentOverOneYear === "yes" : undefined;
        const mapped = purposeToCreateAccountPayload({
          purpose,
          equipmentOverOneYear,
        });
        const plClass = purposeToAccountClassification(purpose);
        await createAccountAction({
          name: values.name,
          code: values.code?.trim() || undefined,
          type: mapped.type,
          category: mapped.category,
          detail_type: mapped.detail_type,
          prd_account_kind: mapped.prd_account_kind,
          ...(plClass ? { account_classification: plClass } : {}),
        });
        toast.success("Account created");
        simpleForm.reset({
          name: "",
          purpose: undefined,
          equipmentOverOneYear: undefined,
          code: "",
        });
      } catch (error) {
        console.error(error);
        toast.error("Failed to create account", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    });
  };

  const onSubmitAdvanced = (values: AdvancedFormValues) => {
    startTransition(async () => {
      try {
        await createAccountAction({
          ...values,
          account_classification:
            values.type === "revenue" || values.type === "expense"
              ? values.account_classification
              : undefined,
        });
        toast.success("Account created");
        advancedForm.reset({
          name: "",
          code: "",
          type: "asset",
          category: null,
          detail_type: null,
          prd_account_kind: undefined,
          account_classification: undefined,
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
  const showPnlClassification = selectedType === "revenue" || selectedType === "expense";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <Label htmlFor="advanced-coa" className="text-sm font-medium cursor-pointer">
          Show advanced accounting settings
        </Label>
        <input
          id="advanced-coa"
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={advancedMode}
          onChange={(e) => {
            const on = e.target.checked;
            setAdvancedMode(on);
            if (on) {
              advancedForm.setValue("name", simpleForm.getValues("name"));
            } else {
              simpleForm.setValue("name", advancedForm.getValues("name"));
            }
          }}
        />
        <p className="text-xs text-muted-foreground w-full sm:w-auto sm:flex-1">
          Turn on only if you need to set account type, category, and subtype yourself.
        </p>
      </div>

      {!advancedMode ? (
        <form className="space-y-4" onSubmit={simpleForm.handleSubmit(onSubmitSimple)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">Account name</Label>
              <Input placeholder="e.g., Main business account" {...simpleForm.register("name")} />
              {simpleForm.formState.errors.name ? (
                <p className="text-xs text-destructive mt-1">{simpleForm.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div>
              <Label className="mb-1.5 block">What is this account used for?</Label>
              <Select
                value={simpleForm.watch("purpose") || undefined}
                onValueChange={(v) => {
                  simpleForm.setValue("purpose", v as SimpleFormValues["purpose"], { shouldValidate: true });
                  if (v !== "equipment") {
                    simpleForm.setValue("equipmentOverOneYear", undefined);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose one…" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_PURPOSE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden>{opt.icon}</span>
                        <span>
                          {opt.label}
                          {opt.description ? (
                            <span className="text-muted-foreground text-xs block sm:inline sm:ml-1">
                              ({opt.description})
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {simpleForm.formState.errors.purpose ? (
                <p className="text-xs text-destructive mt-1">{simpleForm.formState.errors.purpose.message}</p>
              ) : null}
            </div>
          </div>

          {purposeWatch === "equipment" ? (
            <div className="rounded-md border bg-card p-4 space-y-2">
              <Label className="text-sm font-medium">Will this be used for more than one year?</Label>
              <RadioGroup
                value={simpleForm.watch("equipmentOverOneYear") ?? ""}
                onValueChange={(v) =>
                  simpleForm.setValue("equipmentOverOneYear", v as "yes" | "no", { shouldValidate: true })
                }
                className="flex flex-wrap gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="eq-yes" />
                  <Label htmlFor="eq-yes" className="font-normal cursor-pointer">
                    Yes (long-term asset)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="eq-no" />
                  <Label htmlFor="eq-no" className="font-normal cursor-pointer">
                    No (within one year)
                  </Label>
                </div>
              </RadioGroup>
              {simpleForm.formState.errors.equipmentOverOneYear ? (
                <p className="text-xs text-destructive">{simpleForm.formState.errors.equipmentOverOneYear.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  We place long-term equipment in non-current assets; shorter-term items stay in current assets.
                </p>
              )}
            </div>
          ) : null}

          <div className="max-w-xs">
            <Label className="mb-1.5 block">Account code (optional)</Label>
            <Input placeholder="Leave empty to auto-generate" {...simpleForm.register("code")} />
            <p className="text-xs text-muted-foreground mt-1">
              The system picks the next code in the right range for your selection.
            </p>
          </div>

          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={advancedForm.handleSubmit(onSubmitAdvanced)}>
          {showBankWarning && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This looks like a bank account. Bank accounts must use subtype &quot;Bank&quot; to support
                reconciliation.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-1">
              <label className="text-sm font-medium mb-1.5 block">Name</label>
              <Input placeholder="e.g., Accounts Receivable" {...advancedForm.register("name")} />
              {advancedForm.formState.errors.name ? (
                <p className="text-xs text-destructive mt-1">{advancedForm.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="md:col-span-1">
              <label className="text-sm font-medium mb-1.5 block">Code</label>
              <Input placeholder="1100" {...advancedForm.register("code")} />
              {advancedForm.formState.errors.code ? (
                <p className="text-xs text-destructive mt-1">{advancedForm.formState.errors.code.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Leave empty to auto-generate</p>
              )}
            </div>
            <div className="md:col-span-1">
              <label className="text-sm font-medium mb-1.5 block">Type</label>
              <Select
                onValueChange={(value) => {
                  advancedForm.setValue("type", value as AdvancedFormValues["type"]);
                  if (value !== "asset" && value !== "liability") {
                    advancedForm.setValue("category", null);
                  }
                }}
                value={advancedForm.getValues("type")}
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
                    advancedForm.setValue("category", value as "current" | "non_current", {
                      shouldValidate: true,
                    });
                  }}
                  value={advancedForm.watch("category") || undefined}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="non_current">Non-Current</SelectItem>
                  </SelectContent>
                </Select>
                {advancedForm.watch("category") && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {advancedForm.watch("category") === "current" && "Short-term (within 1 year)"}
                    {advancedForm.watch("category") === "non_current" && "Long-term (over 1 year)"}
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
                    advancedForm.setValue("detail_type", value as AdvancedFormValues["detail_type"], {
                      shouldValidate: true,
                    });
                  }}
                  value={advancedForm.watch("detail_type") || undefined}
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
                {!advancedForm.watch("detail_type") && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Is this a Bank Account or another type of Asset?
                  </p>
                )}
                {advancedForm.formState.errors.detail_type ? (
                  <p className="text-xs text-destructive mt-1">
                    {advancedForm.formState.errors.detail_type.message}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="md:col-span-1" />
            )}
          </div>
          {showPnlClassification ? (
            <div className="max-w-md">
              <Label className="mb-1.5 block">Where should this appear in P&amp;L?</Label>
              <Select
                onValueChange={(value) => {
                  advancedForm.setValue(
                    "account_classification",
                    value === "__auto__" ? undefined : (value as NonNullable<AdvancedFormValues["account_classification"]>),
                    { shouldValidate: true },
                  );
                }}
                value={advancedForm.watch("account_classification") ?? "__auto__"}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Auto from account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (recommended)</SelectItem>
                  {pnlClassificationOptionsForType(selectedType).map((k) => (
                    <SelectItem key={k} value={k}>
                      {PNL_CLASSIFICATION_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                This controls Cost of sales vs Operating expenses (and revenue sections). Not inferred from the account name.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium mb-1.5 block">PRD account role (optional)</label>
              <Select
                onValueChange={(value) => {
                  advancedForm.setValue(
                    "prd_account_kind",
                    value === "__none__" ? undefined : (value as AdvancedFormValues["prd_account_kind"]),
                    { shouldValidate: true },
                  );
                }}
                value={advancedForm.watch("prd_account_kind") ?? "__none__"}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Align with reporting role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not set</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="accounts_receivable">Accounts receivable</SelectItem>
                  <SelectItem value="accounts_payable">Accounts payable</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="fixed_asset">Fixed asset</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="equity">Equity</SelectItem>
                  <SelectItem value="tax">Tax</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Optional label for reporting; does not replace type or subtype.
              </p>
            </div>
          </div>
          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

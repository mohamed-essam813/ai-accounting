"use client";

import { useRef, useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createContactAction,
  previewContactDuplicatesAction,
  updateContactAction,
} from "@/lib/actions/contacts";
import { toast } from "sonner";
import type { Database } from "@/lib/database.types";
import type { DuplicateMatch } from "@/lib/data/contacts";
import { Badge } from "@/components/ui/badge";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];

const UAE_EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "UAQ",
  "RAK",
  "Fujairah",
] as const;

const schema = z
  .object({
    name: z.string().min(1, "Name is required"),
    code: z.string().optional(),
    is_customer: z.boolean(),
    is_vendor: z.boolean(),
    is_employee: z.boolean(),
    email: z.union([z.string().email(), z.literal("")]).optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    postal_code: z.string().optional(),
    emirate: z.string().optional(),
    trn: z.string().optional(),
    tax_registration_country: z.string().min(2).optional(),
    is_vat_registered: z.boolean().optional(),
    credit_limit: z.string().optional(),
    payment_terms_days: z.string().optional(),
    payable_terms_days: z.string().optional(),
    default_revenue_account: z.string().optional(),
    default_expense_account: z.string().optional(),
    bank_account_name: z.string().optional(),
    bank_account_number: z.string().optional(),
    bank_name: z.string().optional(),
    iban: z.string().optional(),
    swift_code: z.string().optional(),
    notes: z.string().optional(),
    tags: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.is_customer && !data.is_vendor && !data.is_employee) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select at least one role",
        path: ["is_customer"],
      });
    }
    const trn = (data.trn ?? "").replace(/\D/g, "");
    if (data.is_vat_registered && trn.length > 0 && trn.length !== 15) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TRN must be 15 digits", path: ["trn"] });
    }
  });

type FormValues = z.infer<typeof schema>;

type Props = {
  contact: Contact | null;
  onSuccess: () => void;
};

function roleBadges(c: DuplicateMatch["contact"]) {
  const bits: string[] = [];
  if (c.is_customer) bits.push("customer");
  if (c.is_vendor) bits.push("vendor");
  if (c.is_employee) bits.push("employee");
  return bits;
}

export function ContactForm({ contact, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const [dupes, setDupes] = useState<DuplicateMatch[] | null>(null);
  const duplicateContinueRef = useRef(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: contact?.name ?? "",
      code: contact?.code ?? "",
      is_customer: contact?.is_customer ?? true,
      is_vendor: contact?.is_vendor ?? false,
      is_employee: contact?.is_employee ?? false,
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      address: contact?.address ?? "",
      city: contact?.city ?? "",
      postal_code: contact?.postal_code ?? "",
      emirate: contact?.emirate ?? "",
      trn: contact?.trn ?? "",
      tax_registration_country: contact?.tax_registration_country ?? "AE",
      is_vat_registered: contact?.is_vat_registered ?? false,
      credit_limit: contact?.credit_limit != null ? String(contact.credit_limit) : "",
      payment_terms_days: contact?.payment_terms_days != null ? String(contact.payment_terms_days) : "",
      payable_terms_days: contact?.payable_terms_days != null ? String(contact.payable_terms_days) : "",
      default_revenue_account: contact?.default_revenue_account ?? "",
      default_expense_account: contact?.default_expense_account ?? "",
      bank_account_name: contact?.bank_account_name ?? "",
      bank_account_number: contact?.bank_account_number ?? "",
      bank_name: contact?.bank_name ?? "",
      iban: contact?.iban ?? "",
      swift_code: contact?.swift_code ?? "",
      notes: contact?.notes ?? "",
      tags: (contact?.tags ?? []).join(", "),
    },
  });

  const isCustomer = form.watch("is_customer");
  const isVendor = form.watch("is_vendor");

  const buildApiPayload = (values: FormValues, dupAck: boolean) => ({
    name: values.name,
    code: values.code?.trim() || undefined,
    is_customer: values.is_customer,
    is_vendor: values.is_vendor,
    is_employee: values.is_employee,
    email: values.email,
    phone: values.phone,
    address: values.address,
    city: values.city,
    postal_code: values.postal_code,
    emirate: values.emirate || undefined,
    trn: values.trn?.replace(/\D/g, "") || undefined,
    tax_registration_country: values.tax_registration_country ?? "AE",
    is_vat_registered: values.is_vat_registered ?? false,
    credit_limit: values.credit_limit ? Number(values.credit_limit) : null,
    payment_terms_days: values.payment_terms_days ? Number(values.payment_terms_days) : null,
    payable_terms_days: values.payable_terms_days ? Number(values.payable_terms_days) : null,
    default_revenue_account: values.default_revenue_account,
    default_expense_account: values.default_expense_account,
    bank_account_name: values.bank_account_name,
    bank_account_number: values.bank_account_number,
    bank_name: values.bank_name,
    iban: values.iban,
    swift_code: values.swift_code,
    notes: values.notes,
    tags: values.tags
      ? values.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    duplicate_warning_acknowledged: dupAck,
  });

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        if (!contact && !duplicateContinueRef.current) {
          const found = await previewContactDuplicatesAction({
            name: values.name,
            email: values.email,
            phone: values.phone,
            trn: values.trn,
          });
          if (found.length > 0) {
            setDupes(found);
            return;
          }
        }
        const payload = buildApiPayload(values, duplicateContinueRef.current);
        if (contact) {
          await updateContactAction({ ...payload, contactId: contact.id });
          toast.success("Contact updated");
        } else {
          await createContactAction(payload);
          toast.success("Contact created");
        }
        duplicateContinueRef.current = false;
        onSuccess();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  return (
    <>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Name *</label>
          <Input {...form.register("name")} disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Code (optional override)</label>
          <Input {...form.register("code")} placeholder="Auto if empty" disabled={isPending} />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Roles *</span>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-input"
                checked={form.watch("is_customer")}
                onChange={(e) => form.setValue("is_customer", e.target.checked)}
                disabled={isPending}
              />
              Customer
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-input"
                checked={form.watch("is_vendor")}
                onChange={(e) => form.setValue("is_vendor", e.target.checked)}
                disabled={isPending}
              />
              Vendor
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-input"
                checked={form.watch("is_employee")}
                onChange={(e) => form.setValue("is_employee", e.target.checked)}
                disabled={isPending}
              />
              Employee
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input type="email" {...form.register("email")} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Phone</label>
            <Input {...form.register("phone")} disabled={isPending} />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Address</label>
          <Textarea rows={2} {...form.register("address")} disabled={isPending} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">City</label>
            <Input {...form.register("city")} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Postal code</label>
            <Input {...form.register("postal_code")} disabled={isPending} />
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">UAE / VAT</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Emirate</label>
              <Controller
                name="emirate"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)} disabled={isPending}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {UAE_EMIRATES.map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tax registration country</label>
              <Input {...form.register("tax_registration_country")} disabled={isPending} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border border-input"
              checked={!!form.watch("is_vat_registered")}
              onChange={(e) => form.setValue("is_vat_registered", e.target.checked)}
              disabled={isPending}
            />
            VAT registered
          </label>
          <div className="space-y-2">
            <label className="text-sm font-medium">TRN (15 digits)</label>
            <Input
              {...form.register("trn")}
              onChange={(e) => form.setValue("trn", e.target.value.replace(/\D/g, "").slice(0, 15))}
              disabled={isPending}
            />
          </div>
        </div>

        {isCustomer ? (
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">Customer</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Credit limit (AED)</label>
                <Input {...form.register("credit_limit")} disabled={isPending} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Payment terms (days)</label>
                <Input {...form.register("payment_terms_days")} disabled={isPending} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Default revenue account (CoA code)</label>
                <Input {...form.register("default_revenue_account")} disabled={isPending} />
              </div>
            </div>
          </div>
        ) : null}

        {isVendor ? (
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">Vendor</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Payable terms (days)</label>
                <Input {...form.register("payable_terms_days")} disabled={isPending} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Default expense account (CoA code)</label>
                <Input {...form.register("default_expense_account")} disabled={isPending} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Bank name</label>
                <Input {...form.register("bank_name")} disabled={isPending} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Account name</label>
                <Input {...form.register("bank_account_name")} disabled={isPending} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Account number</label>
                <Input {...form.register("bank_account_number")} disabled={isPending} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">IBAN</label>
                <Input {...form.register("iban")} disabled={isPending} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">SWIFT</label>
                <Input {...form.register("swift_code")} disabled={isPending} />
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">Notes</label>
          <Textarea rows={3} {...form.register("notes")} disabled={isPending} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Tags (comma-separated)</label>
          <Input {...form.register("tags")} disabled={isPending} />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : contact ? "Update Contact" : "Create Contact"}
          </Button>
        </div>
      </form>

      <Dialog open={!!dupes?.length} onOpenChange={() => setDupes(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Similar contacts exist</DialogTitle>
            <DialogDescription>
              This contact looks similar to existing ones. You can continue anyway or cancel and use an existing record.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {dupes?.map((d) => (
              <li key={d.contact.id} className="rounded border p-2">
                <div className="font-medium">{d.contact.name}</div>
                <div className="text-muted-foreground font-mono text-xs">{d.contact.code}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {roleBadges(d.contact).map((b) => (
                    <Badge key={b} variant="secondary" className="text-[10px]">
                      {b}
                    </Badge>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {d.reasons.join(" · ")} · {d.band} match
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDupes(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                duplicateContinueRef.current = true;
                setDupes(null);
                void form.handleSubmit(onSubmit)();
              }}
            >
              Continue anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

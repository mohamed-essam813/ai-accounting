"use client";

import { useForm } from "react-hook-form";
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
import { createContactAction, updateContactAction } from "@/lib/actions/contacts";
import { toast } from "sonner";
import { useTransition } from "react";
import type { Database } from "@/lib/database.types";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];

const ContactFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["customer", "vendor", "other"]),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  tax_id: z.string().optional().or(z.literal("")),
});

type ContactFormValues = z.infer<typeof ContactFormSchema>;

type Props = {
  contact: Contact | null;
  onSuccess: () => void;
};

export function ContactForm({ contact, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(ContactFormSchema),
    defaultValues: {
      name: contact?.name ?? "",
      type: (contact?.type as "customer" | "vendor" | "other") ?? "customer",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      address: contact?.address ?? "",
      tax_id: contact?.tax_id ?? "",
    },
  });

  const typeValue = form.watch("type");

  const onSubmit = (values: ContactFormValues) => {
    startTransition(async () => {
      try {
        if (contact) {
          await updateContactAction({
            contactId: contact.id,
            ...values,
          });
          toast.success("Contact updated");
        } else {
          await createContactAction(values);
          toast.success("Contact created");
        }
        onSuccess();
      } catch (error) {
        console.error(error);
        toast.error(`Failed to ${contact ? "update" : "create"} contact`, {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Name *</label>
        <Input {...form.register("name")} />
        {form.formState.errors.name && (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Type *</label>
        <Select
          value={form.watch("type")}
          onValueChange={(value) => form.setValue("type", value as "customer" | "vendor" | "other")}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select contact type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="vendor">Vendor</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {typeValue === "customer" && "Customer contacts will be prefixed with CUST-"}
          {typeValue === "vendor" && "Vendor contacts will be prefixed with SUP-"}
          {typeValue === "other" && "Other contacts will be prefixed with OTH-"}
        </p>
        {form.formState.errors.type && (
          <p className="text-xs text-destructive">{form.formState.errors.type.message}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <Input type="email" {...form.register("email")} />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Phone</label>
          <Input {...form.register("phone")} />
          {form.formState.errors.phone && (
            <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Address</label>
        <Textarea rows={3} {...form.register("address")} />
        {form.formState.errors.address && (
          <p className="text-xs text-destructive">{form.formState.errors.address.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Tax ID</label>
        <Input {...form.register("tax_id")} />
        {form.formState.errors.tax_id && (
          <p className="text-xs text-destructive">{form.formState.errors.tax_id.message}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : contact ? "Update Contact" : "Create Contact"}
        </Button>
      </div>
    </form>
  );
}

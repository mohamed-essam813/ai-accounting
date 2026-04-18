"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import {
  findContactByNormalizedName,
  findDuplicateCandidates,
  getContactOutstandingTotal,
  type ContactsRow,
} from "@/lib/data/contacts";
import type { Database, Json } from "@/lib/database.types";
import { canManageAccounts, type UserRole } from "@/lib/auth";

type ContactsInsert = Database["public"]["Tables"]["contacts"]["Insert"];
type ContactsUpdate = Database["public"]["Tables"]["contacts"]["Update"];
type AuditLogsInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

const uaeTrn = z
  .string()
  .trim()
  .regex(/^\d{15}$/, "TRN must be exactly 15 digits")
  .optional()
  .or(z.literal(""));

const ContactCreateSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    is_customer: z.boolean(),
    is_vendor: z.boolean(),
    is_employee: z.boolean(),
    email: z.union([z.string().email(), z.literal("")]).optional(),
    phone: z.string().optional().or(z.literal("")),
    address: z.string().optional().or(z.literal("")),
    city: z.string().optional().or(z.literal("")),
    postal_code: z.string().optional().or(z.literal("")),
    emirate: z.string().optional().or(z.literal("")),
    trn: z.string().optional().or(z.literal("")),
    tax_registration_country: z.string().min(2).optional(),
    is_vat_registered: z.boolean().optional(),
    credit_limit: z.coerce.number().nonnegative().optional().nullable(),
    payment_terms_days: z.coerce.number().int().nonnegative().optional().nullable(),
    payable_terms_days: z.coerce.number().int().nonnegative().optional().nullable(),
    default_revenue_account: z.string().optional().or(z.literal("")),
    default_expense_account: z.string().optional().or(z.literal("")),
    bank_account_name: z.string().optional().or(z.literal("")),
    bank_account_number: z.string().optional().or(z.literal("")),
    bank_name: z.string().optional().or(z.literal("")),
    iban: z.string().optional().or(z.literal("")),
    swift_code: z.string().optional().or(z.literal("")),
    notes: z.string().optional().or(z.literal("")),
    tags: z.array(z.string()).optional(),
    code: z.string().optional(),
    duplicate_warning_acknowledged: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.is_customer && !data.is_vendor && !data.is_employee) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select at least one role: Customer, Vendor, or Employee",
        path: ["is_customer"],
      });
    }
    if (data.is_vat_registered && data.trn && data.trn.replace(/\D/g, "").length > 0) {
      const d = data.trn.replace(/\D/g, "");
      if (d.length !== 15) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TRN must be 15 digits", path: ["trn"] });
      }
    }
  });

const ContactUpdateSchema = ContactCreateSchema.extend({
  contactId: z.string().uuid(),
});

export async function previewContactDuplicatesAction(input: {
  name: string;
  email?: string;
  phone?: string;
  trn?: string;
  excludeId?: string;
}) {
  return findDuplicateCandidates(
    {
      name: input.name,
      email: input.email,
      phone: input.phone,
      trn: input.trn,
      excludeId: input.excludeId,
    },
    5,
  );
}

export async function createContactAction(input: z.infer<typeof ContactCreateSchema>) {
  const payload = ContactCreateSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  const trnClean = payload.trn?.trim() || null;
  if (trnClean && !/^\d{15}$/.test(trnClean)) {
    uaeTrn.parse(trnClean);
  }

  const supabase = await createServerSupabaseClient();
  const insertData: ContactsInsert = {
    tenant_id: user.tenant.id,
    name: payload.name.trim(),
    is_customer: payload.is_customer,
    is_vendor: payload.is_vendor,
    is_employee: payload.is_employee,
    email: payload.email || null,
    phone: payload.phone || null,
    address: payload.address || null,
    city: payload.city || null,
    postal_code: payload.postal_code || null,
    emirate: payload.emirate || null,
    trn: trnClean,
    tax_registration_country: payload.tax_registration_country ?? "AE",
    is_vat_registered: payload.is_vat_registered ?? false,
    credit_limit: payload.credit_limit ?? null,
    payment_terms_days: payload.payment_terms_days ?? null,
    payable_terms_days: payload.payable_terms_days ?? null,
    default_revenue_account: payload.default_revenue_account || null,
    default_expense_account: payload.default_expense_account || null,
    bank_account_name: payload.bank_account_name || null,
    bank_account_number: payload.bank_account_number || null,
    bank_name: payload.bank_name || null,
    iban: payload.iban || null,
    swift_code: payload.swift_code || null,
    notes: payload.notes || null,
    tags: payload.tags ?? [],
    code: (payload.code ?? "").trim(),
    is_active: true,
    duplicate_warning_acknowledged: payload.duplicate_warning_acknowledged ?? false,
  };

  const { data, error } = await supabase.from("contacts").insert([insertData]).select("*").maybeSingle();

  if (error) {
    console.error("Failed to create contact", error);
    throw error;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "contact.created",
    entity: "contacts",
    entity_id: data?.id ?? null,
    changes: { name: payload.name, code: data?.code },
  };
  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<unknown> }).insert([
    auditData,
  ]);

  revalidatePath("/contacts");
  return data as ContactsRow;
}

export async function findOrCreateContactAction(name: string, kind: "customer" | "vendor"): Promise<ContactsRow> {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("User tenant not resolved.");
  }

  const existing = await findContactByNormalizedName("any", name);
  if (existing) {
    const supabase = await createServerSupabaseClient();
    const patch: ContactsUpdate = {};
    if (kind === "customer" && !existing.is_customer) patch.is_customer = true;
    if (kind === "vendor" && !existing.is_vendor) patch.is_vendor = true;
    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase
        .from("contacts")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      revalidatePath("/contacts");
      return data as ContactsRow;
    }
    return existing;
  }

  const supabase = await createServerSupabaseClient();
  const insertData: ContactsInsert = {
    tenant_id: user.tenant.id,
    name: name.trim(),
    is_customer: kind === "customer",
    is_vendor: kind === "vendor",
    is_employee: false,
    email: null,
    phone: null,
    address: null,
    code: "",
    tax_registration_country: "AE",
    is_vat_registered: false,
    tags: [],
    duplicate_warning_acknowledged: false,
  };

  const { data, error } = await supabase.from("contacts").insert([insertData]).select("*").maybeSingle();

  if (error || !data) {
    console.error("Failed to create contact", error);
    throw new Error("Failed to create contact");
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "contact.created",
    entity: "contacts",
    entity_id: data.id,
    changes: { name: data.name, code: data.code, auto_created: true },
  };
  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<unknown> }).insert([
    auditData,
  ]);

  revalidatePath("/contacts");
  return data as ContactsRow;
}

export async function updateContactAction(input: z.infer<typeof ContactUpdateSchema>) {
  const payload = ContactUpdateSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) {
    throw new Error("Tenant not resolved.");
  }

  const collision = await findContactByNormalizedName("any", payload.name);
  if (collision && collision.id !== payload.contactId) {
    throw new Error(`Another contact already uses the name "${collision.name}".`);
  }

  const trnClean = payload.trn?.trim() || null;
  if (trnClean && !/^\d{15}$/.test(trnClean)) {
    throw new Error("TRN must be exactly 15 digits");
  }

  const supabase = await createServerSupabaseClient();
  const updateData: ContactsUpdate = {
    name: payload.name.trim(),
    is_customer: payload.is_customer,
    is_vendor: payload.is_vendor,
    is_employee: payload.is_employee,
    email: payload.email || null,
    phone: payload.phone || null,
    address: payload.address || null,
    city: payload.city || null,
    postal_code: payload.postal_code || null,
    emirate: payload.emirate || null,
    trn: trnClean,
    tax_registration_country: payload.tax_registration_country ?? "AE",
    is_vat_registered: payload.is_vat_registered ?? false,
    credit_limit: payload.credit_limit ?? null,
    payment_terms_days: payload.payment_terms_days ?? null,
    payable_terms_days: payload.payable_terms_days ?? null,
    default_revenue_account: payload.default_revenue_account || null,
    default_expense_account: payload.default_expense_account || null,
    bank_account_name: payload.bank_account_name || null,
    bank_account_number: payload.bank_account_number || null,
    bank_name: payload.bank_name || null,
    iban: payload.iban || null,
    swift_code: payload.swift_code || null,
    notes: payload.notes || null,
    tags: payload.tags ?? [],
  };

  const { error } = await supabase
    .from("contacts")
    .update(updateData)
    .eq("id", payload.contactId)
    .eq("tenant_id", user.tenant.id);

  if (error) {
    console.error("Failed to update contact", error);
    throw error;
  }

  const auditData: AuditLogsInsert = {
    tenant_id: user.tenant.id,
    actor_id: user.id,
    action: "contact.updated",
    entity: "contacts",
    entity_id: payload.contactId,
    changes: updateData as Json,
  };
  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<unknown> }).insert([
    auditData,
  ]);

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${payload.contactId}`);
  return { success: true };
}

const DeactivateSchema = z.object({
  contactId: z.string().uuid(),
  reason: z.string().optional(),
  overrideReason: z.string().optional(),
});

export async function deactivateContactAction(input: z.infer<typeof DeactivateSchema>) {
  const payload = DeactivateSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");

  const { ar, ap } = await getContactOutstandingTotal(payload.contactId);
  const total = ar + ap;
  if (total > 0.005) {
    if (!payload.overrideReason?.trim()) {
      const part =
        ar > 0.005 && ap > 0.005
          ? `receivable of AED ${ar.toFixed(2)} and payable of AED ${ap.toFixed(2)}`
          : ar > 0.005
            ? `receivable of AED ${ar.toFixed(2)}`
            : `payable of AED ${ap.toFixed(2)}`;
      throw new Error(`Cannot deactivate. This contact has outstanding ${part}. Settle or write off first.`);
    }
    if (!canManageAccounts(user.role as UserRole)) {
      throw new Error("Only an administrator can override deactivation when a balance is outstanding.");
    }
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("contacts")
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivated_by: user.id,
      deactivation_reason: payload.reason?.trim() || null,
      deactivation_override_reason: payload.overrideReason?.trim() || null,
    })
    .eq("id", payload.contactId)
    .eq("tenant_id", user.tenant.id);

  if (error) throw error;

  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<unknown> }).insert([
    {
      tenant_id: user.tenant.id,
      actor_id: user.id,
      action: "contact.deactivated",
      entity: "contacts",
      entity_id: payload.contactId,
      changes: {
        reason: payload.reason,
        override: payload.overrideReason ?? null,
        outstanding_ar: ar,
        outstanding_ap: ap,
      },
    },
  ]);

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${payload.contactId}`);
  return { success: true };
}

export async function reactivateContactAction(contactId: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");
  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only administrators can reactivate contacts.");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("contacts")
    .update({
      is_active: true,
      deactivated_at: null,
      deactivated_by: null,
      deactivation_reason: null,
      deactivation_override_reason: null,
    })
    .eq("id", contactId)
    .eq("tenant_id", user.tenant.id);

  if (error) throw error;

  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<unknown> }).insert([
    {
      tenant_id: user.tenant.id,
      actor_id: user.id,
      action: "contact.reactivated",
      entity: "contacts",
      entity_id: contactId,
      changes: {},
    },
  ]);

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}

export async function mergeContactsAction(keepId: string, mergeId: string, note?: string) {
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Tenant not resolved.");
  if (!canManageAccounts(user.role as UserRole)) {
    throw new Error("Only administrators can merge contacts.");
  }
  if (keepId === mergeId) throw new Error("Cannot merge a contact into itself.");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("merge_contacts_into", {
    p_tenant_id: user.tenant.id,
    p_keep_id: keepId,
    p_merge_id: mergeId,
    p_note: note ?? "",
  });

  if (error) {
    console.error(error);
    throw new Error(error.message || "Merge failed");
  }

  await (supabase.from("audit_logs") as unknown as { insert: (v: AuditLogsInsert[]) => Promise<unknown> }).insert([
    {
      tenant_id: user.tenant.id,
      actor_id: user.id,
      action: "contact.merged",
      entity: "contacts",
      entity_id: keepId,
      changes: { merge_id: mergeId, keep_id: keepId, note: note ?? null },
    },
  ]);

  revalidatePath("/contacts");
  revalidatePath("/contacts/duplicates");
  return { success: true };
}

export async function bulkDeactivateContactsAction(
  contactIds: string[],
  reason?: string,
  overrideReason?: string,
) {
  for (const id of contactIds) {
    await deactivateContactAction({ contactId: id, reason, overrideReason });
  }
  return { success: true };
}

export async function getContactStatementAction(
  contactId: string,
  startDate?: string,
  endDate?: string,
) {
  const { getContactStatement } = await import("@/lib/data/contacts");
  return await getContactStatement(contactId, startDate, endDate);
}

/** @deprecated Soft-deactivate only — use deactivateContactAction */
export async function deleteContactAction(contactId: string) {
  return deactivateContactAction({ contactId, reason: "Legacy delete action" });
}

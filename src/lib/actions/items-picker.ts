"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { searchBusinessItems, getBusinessItemById } from "@/lib/data/inventory";
import { listAccounts } from "@/lib/data/accounts";
import { listUnitsOfMeasure } from "@/lib/data/units-of-measure";
import type { Account } from "@/lib/accounting";
import type { BusinessItem } from "@/lib/data/inventory";

export async function searchItemsPickerAction(query: string): Promise<BusinessItem[]> {
  return searchBusinessItems(query, 40);
}

export async function getItemPickerByIdAction(id: string): Promise<BusinessItem | null> {
  return getBusinessItemById(id);
}

const ServiceWizardSchema = z.object({
  kind: z.literal("service"),
  name: z.string().min(1, "Name is required"),
  revenue_account_id: z.string().uuid(),
  expense_account_id: z.string().uuid().optional().nullable(),
  default_tax_rate_id: z.string().uuid().optional().nullable(),
  selling_price: z.number().nonnegative().optional().nullable(),
  keywords: z.string().optional().nullable(),
});

const ProductWizardSchema = z
  .object({
    kind: z.literal("product"),
    name: z.string().min(1),
    inventory_tracked: z.boolean(),
    sku: z.string().optional().nullable(),
    unit: z.string().min(1),
    uom_id: z.string().uuid(),
    inventory_account_id: z.string().uuid().optional().nullable(),
    cogs_account_id: z.string().uuid().optional().nullable(),
    revenue_account_id: z.string().uuid(),
    expense_account_id: z.string().uuid().optional().nullable(),
    default_tax_rate_id: z.string().uuid().optional().nullable(),
    cost_price: z.number().nonnegative().optional().nullable(),
    selling_price: z.number().nonnegative().optional().nullable(),
    keywords: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.inventory_tracked) {
      if (!data.inventory_account_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inventory account is required when tracking stock." });
      }
      if (!data.cogs_account_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "COGS account is required when tracking stock." });
      }
    }
  });

const WizardSchema = z.discriminatedUnion("kind", [ServiceWizardSchema, ProductWizardSchema]);

export async function createItemWizardAction(input: z.infer<typeof WizardSchema>) {
  const payload = WizardSchema.parse(input);
  const user = await getCurrentUser();
  if (!user?.tenant) throw new Error("Not signed in.");

  const supabase = await createServerSupabaseClient();

  const { data: policy } = await supabase
    .from("accounting_policies" as never)
    .select("inventory_valuation_method")
    .eq("tenant_id", user.tenant.id)
    .maybeSingle();

  const valuationMethod =
    ((policy as { inventory_valuation_method?: string } | null)?.inventory_valuation_method ||
      "fifo") as "fifo" | "weighted_average";

  if (payload.kind === "service") {
    const uoms = await listUnitsOfMeasure();
    const uomId = uoms[0]?.id;
    if (!uomId) {
      throw new Error("Add a unit of measure before creating items.");
    }
    const { data, error } = await supabase
      .from("inventory_items")
      .insert({
        tenant_id: user.tenant.id,
        name: payload.name.trim(),
        sku: null,
        description: null,
        unit: "unit",
        uom_id: uomId,
        valuation_method: valuationMethod,
        item_type: "service",
        inventory_tracked: false,
        revenue_account_id: payload.revenue_account_id,
        expense_account_id: payload.expense_account_id ?? null,
        default_tax_rate_id: payload.default_tax_rate_id ?? null,
        selling_price: payload.selling_price ?? null,
        inventory_account_id: null,
        cogs_account_id: null,
        keywords: payload.keywords?.trim() || null,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) throw error;
    if (data?.id) {
      await supabase.from("inventory_balances").insert({
        tenant_id: user.tenant.id,
        item_id: data.id,
        quantity: 0,
        total_value: 0,
      });
    }
    revalidatePath("/inventory");
    revalidatePath("/prompt");
    return { id: data?.id as string };
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      tenant_id: user.tenant.id,
      name: payload.name.trim(),
      sku: payload.sku?.trim() || null,
      description: null,
      unit: payload.unit.trim(),
      uom_id: payload.uom_id,
      valuation_method: valuationMethod,
      item_type: "product",
      inventory_tracked: payload.inventory_tracked,
      revenue_account_id: payload.revenue_account_id,
      expense_account_id: payload.expense_account_id ?? null,
      default_tax_rate_id: payload.default_tax_rate_id ?? null,
      cost_price: payload.cost_price ?? null,
      selling_price: payload.selling_price ?? null,
      inventory_account_id: payload.inventory_tracked ? payload.inventory_account_id : null,
      cogs_account_id: payload.inventory_tracked ? payload.cogs_account_id : null,
      keywords: payload.keywords?.trim() || null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (data?.id) {
    await supabase.from("inventory_balances").insert({
      tenant_id: user.tenant.id,
      item_id: data.id,
      quantity: 0,
      total_value: 0,
    });
  }
  revalidatePath("/inventory");
  revalidatePath("/prompt");
  return { id: data?.id as string };
}

export async function listAccountsForItemWizardAction(): Promise<
  Pick<Account, "id" | "name" | "code" | "type">[]
> {
  const accounts = await listAccounts();
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    type: a.type,
  }));
}

export async function listUomsForWizardAction() {
  const { listUnitsOfMeasure } = await import("@/lib/data/units-of-measure");
  return listUnitsOfMeasure();
}

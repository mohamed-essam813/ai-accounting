"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type VatSupplyTreatment = "standard" | "zero_rated" | "exempt";

export interface TaxRate {
  id: string;
  tenant_id: string;
  name: string;
  percentage: number;
  tax_type: "input" | "output";
  output_vat_account_id: string | null;
  input_vat_account_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  vat_supply_treatment: VatSupplyTreatment;
}

function parseVatSupplyTreatment(v: unknown): VatSupplyTreatment {
  if (v === "zero_rated" || v === "exempt") return v;
  return "standard";
}

const CreateTaxRateSchema = z
  .object({
    name: z.string().min(1, "Tax rate name is required"),
    percentage: z
      .number()
      .refine((n) => !Number.isNaN(n), "Enter a valid number")
      .refine((n) => n >= 0, "Rate cannot be negative")
      .refine((n) => n <= 100, "Rate cannot exceed 100"),
    tax_type: z.enum(["input", "output"]),
    output_vat_account_id: z.string().uuid().optional().nullable(),
    input_vat_account_id: z.string().uuid().optional().nullable(),
    vat_supply_treatment: z.enum(["zero_rated", "exempt"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.percentage === 0) {
      if (!data.vat_supply_treatment) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vat_supply_treatment"],
          message: "For 0% tax, choose Zero rated or Exempt.",
        });
      }
    }
  });

const UpdateTaxRateSchema = CreateTaxRateSchema.extend({
  id: z.string().uuid(),
  is_active: z.boolean().optional(),
});

export type CreateTaxRateResult =
  | { success: true; data: TaxRate }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

export type UpdateTaxRateResult =
  | { success: true; data: TaxRate }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

export type DeleteTaxRateResult = { success: true } | { success: false; error: string };

function zodFieldErrors(issues: z.ZodIssue[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const i of issues) {
    const path = i.path.join(".");
    if (path && i.message) map[path] = i.message;
  }
  return map;
}

async function getAccountType(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  accountId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("type")
    .eq("id", accountId)
    .maybeSingle();
  return data?.type ?? null;
}

export async function listTaxRatesAction(): Promise<TaxRate[]> {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) return [];

    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase.from("tax_rates" as any) as any)
      .select("*")
      .eq("tenant_id", user.tenant.id)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Failed to load tax rates", error);
      return [];
    }

    return (data ?? []).map((rate: any) => {
      const r = Number(rate.rate ?? rate.percentage / 100);
      return {
        ...rate,
        percentage: Math.round(r * 10000) / 100,
        vat_supply_treatment: parseVatSupplyTreatment(rate.vat_supply_treatment),
      };
    });
  } catch (e) {
    console.error("listTaxRatesAction", e);
    return [];
  }
}

export async function createTaxRateAction(
  input: z.infer<typeof CreateTaxRateSchema>
): Promise<CreateTaxRateResult> {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return { success: false, error: "User tenant not resolved." };
    }

    const parsed = CreateTaxRateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Validation failed",
        fieldErrors: zodFieldErrors(parsed.error.issues),
      };
    }

    const payload = parsed.data;
    const supabase = await createServerSupabaseClient();

    const accountRequiredMessage =
      "Please create and select a tax control account first.";

    if (payload.tax_type === "output") {
      if (!payload.output_vat_account_id) {
        return {
          success: false,
          error: accountRequiredMessage,
          fieldErrors: { output_vat_account_id: accountRequiredMessage },
        };
      }
      const accountType = await getAccountType(supabase, payload.output_vat_account_id);
      if (accountType !== "liability") {
        return {
          success: false,
          error: accountRequiredMessage,
          fieldErrors: {
            output_vat_account_id:
              "Output VAT must link to a liability account.",
          },
        };
      }
    } else {
      if (!payload.input_vat_account_id) {
        return {
          success: false,
          error: accountRequiredMessage,
          fieldErrors: { input_vat_account_id: accountRequiredMessage },
        };
      }
      const accountType = await getAccountType(supabase, payload.input_vat_account_id);
      if (accountType !== "asset") {
        return {
          success: false,
          error: accountRequiredMessage,
          fieldErrors: {
            input_vat_account_id: "Input VAT must link to an asset account.",
          },
        };
      }
    }

    const { data: existing } = await (supabase.from("tax_rates" as any) as any)
      .select("id")
      .eq("tenant_id", user.tenant.id)
      .eq("name", payload.name)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: `A tax rate named "${payload.name}" already exists.`,
        fieldErrors: { name: `A tax rate named "${payload.name}" already exists.` },
      };
    }

    const rateDecimal = payload.percentage / 100;
    const vat_supply_treatment: VatSupplyTreatment =
      payload.percentage === 0 ? payload.vat_supply_treatment! : "standard";
    const insertPayload = {
      tenant_id: user.tenant.id,
      name: payload.name,
      rate: rateDecimal,
      percentage: payload.percentage,
      tax_type: payload.tax_type,
      output_vat_account_id: payload.tax_type === "output" ? payload.output_vat_account_id : null,
      input_vat_account_id: payload.tax_type === "input" ? payload.input_vat_account_id : null,
      is_active: true,
      vat_supply_treatment,
    };

    const { data, error } = await (supabase.from("tax_rates" as any) as any)
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("Failed to create tax rate", error);
      return {
        success: false,
        error: error.message ?? "Failed to create tax rate.",
      };
    }

    revalidatePath("/settings");
    const r = Number(data.rate ?? data.percentage / 100);
    return {
      success: true,
      data: {
        ...data,
        percentage: Math.round(r * 10000) / 100,
        vat_supply_treatment: parseVatSupplyTreatment(data.vat_supply_treatment),
      },
    };
  } catch (e) {
    console.error("createTaxRateAction", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create tax rate.",
    };
  }
}

export async function updateTaxRateAction(
  input: z.infer<typeof UpdateTaxRateSchema>
): Promise<UpdateTaxRateResult> {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return { success: false, error: "User tenant not resolved." };
    }

    const parsed = UpdateTaxRateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Validation failed",
        fieldErrors: zodFieldErrors(parsed.error.issues),
      };
    }

    const payload = parsed.data;
    const supabase = await createServerSupabaseClient();

    const accountRequiredMessage =
      "Please create and select a tax control account first.";

    if (payload.tax_type === "output") {
      if (!payload.output_vat_account_id) {
        return {
          success: false,
          error: accountRequiredMessage,
          fieldErrors: { output_vat_account_id: accountRequiredMessage },
        };
      }
      const accountType = await getAccountType(supabase, payload.output_vat_account_id);
      if (accountType !== "liability") {
        return {
          success: false,
          error: accountRequiredMessage,
          fieldErrors: {
            output_vat_account_id:
              "Output VAT must link to a liability account.",
          },
        };
      }
    } else {
      if (!payload.input_vat_account_id) {
        return {
          success: false,
          error: accountRequiredMessage,
          fieldErrors: { input_vat_account_id: accountRequiredMessage },
        };
      }
      const accountType = await getAccountType(supabase, payload.input_vat_account_id);
      if (accountType !== "asset") {
        return {
          success: false,
          error: accountRequiredMessage,
          fieldErrors: {
            input_vat_account_id: "Input VAT must link to an asset account.",
          },
        };
      }
    }

    const { data: existing } = await (supabase.from("tax_rates" as any) as any)
      .select("id")
      .eq("id", payload.id)
      .eq("tenant_id", user.tenant.id)
      .maybeSingle();

    if (!existing) {
      return { success: false, error: "Tax rate not found." };
    }

    const { data: used } = await (supabase.rpc as any)(
      "tax_rate_used_in_posted_drafts",
      { p_tenant_id: user.tenant.id, p_rate_id: payload.id }
    );
    if (used === true) {
      return {
        success: false,
        error:
          "This tax rate cannot be edited because it has been used in posted transactions.",
      };
    }

    if (payload.name) {
      const { data: nameConflict } = await (supabase.from("tax_rates" as any) as any)
        .select("id")
        .eq("tenant_id", user.tenant.id)
        .eq("name", payload.name)
        .neq("id", payload.id)
        .maybeSingle();

      if (nameConflict) {
        return {
          success: false,
          error: `A tax rate named "${payload.name}" already exists.`,
          fieldErrors: { name: `A tax rate named "${payload.name}" already exists.` },
        };
      }
    }

    const rateDecimal = payload.percentage / 100;
    const vat_supply_treatment: VatSupplyTreatment =
      payload.percentage === 0 ? payload.vat_supply_treatment! : "standard";
    const updatePayload = {
      name: payload.name,
      rate: rateDecimal,
      percentage: payload.percentage,
      tax_type: payload.tax_type,
      output_vat_account_id: payload.tax_type === "output" ? payload.output_vat_account_id : null,
      input_vat_account_id: payload.tax_type === "input" ? payload.input_vat_account_id : null,
      vat_supply_treatment,
      ...(typeof payload.is_active === "boolean" && { is_active: payload.is_active }),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await (supabase.from("tax_rates" as any) as any)
      .update(updatePayload)
      .eq("id", payload.id)
      .eq("tenant_id", user.tenant.id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update tax rate", error);
      return {
        success: false,
        error: error.message ?? "Failed to update tax rate.",
      };
    }

    revalidatePath("/settings");
    const r = Number(data.rate ?? data.percentage / 100);
    return {
      success: true,
      data: {
        ...data,
        percentage: Math.round(r * 10000) / 100,
        vat_supply_treatment: parseVatSupplyTreatment(data.vat_supply_treatment),
      },
    };
  } catch (e) {
    console.error("updateTaxRateAction", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update tax rate.",
    };
  }
}

export async function deleteTaxRateAction(id: string): Promise<DeleteTaxRateResult> {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return { success: false, error: "User tenant not resolved." };
    }

    const supabase = await createServerSupabaseClient();

    const { data: used } = await (supabase.rpc as any)(
      "tax_rate_used_in_posted_drafts",
      { p_tenant_id: user.tenant.id, p_rate_id: id }
    );
    if (used === true) {
      return {
        success: false,
        error:
          "This tax rate cannot be deleted because it has been used in posted transactions.",
      };
    }

    const { error } = await (supabase.from("tax_rates" as any) as any)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", user.tenant.id);

    if (error) {
      console.error("Failed to delete tax rate", error);
      return {
        success: false,
        error: error.message ?? "Failed to delete tax rate.",
      };
    }

    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    console.error("deleteTaxRateAction", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to delete tax rate.",
    };
  }
}

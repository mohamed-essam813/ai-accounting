/**
 * API Route for Updating FX Rates
 * 
 * This endpoint can be called:
 * - Manually by admins
 * - By a cron job/scheduler (e.g., Vercel Cron, Supabase Edge Functions)
 * - On-demand when rates are needed
 * 
 * Usage:
 * POST /api/fx-rates/update
 * Body: { tenantId?: string, provider?: "exchangerate-api" | "fixer" | "currencyapi" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/users";
import { fetchAndStoreFXRates, fetchFXRatesForAllTenants, getRecommendedProvider } from "@/lib/services/fx-rates";
import { z } from "zod";

const UpdateRatesSchema = z.object({
  tenantId: z.string().uuid().optional(),
  provider: z.enum(["exchangerate-api", "fixer", "currencyapi"]).optional(),
  date: z.string().optional(), // ISO date string (YYYY-MM-DD)
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, provider, date } = UpdateRatesSchema.parse(body);

    // If tenantId provided, update for that tenant only
    if (tenantId) {
      // Verify user has access to this tenant
      const user = await getCurrentUser();
      if (!user?.tenant || user.tenant.id !== tenantId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const result = await fetchAndStoreFXRates(
        tenantId,
        "USD", // Base currency - TODO: Get from tenant settings
        provider || getRecommendedProvider(),
        date,
      );

      return NextResponse.json({
        success: true,
        tenantId,
        ...result,
      });
    }

    // If no tenantId, update for all tenants (admin/system operation)
    // This should be called by cron jobs or system admins
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can update rates for all tenants" },
        { status: 403 },
      );
    }

    await fetchFXRatesForAllTenants(provider || getRecommendedProvider());

    return NextResponse.json({
      success: true,
      message: "FX rates updated for all tenants",
    });
  } catch (error) {
    console.error("Failed to update FX rates:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update FX rates",
      },
      { status: 500 },
    );
  }
}

/**
 * GET endpoint to check rate update status
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { createServiceSupabaseClient } = await import("@/lib/supabase/service");
    const supabase = createServiceSupabaseClient();

    // Get latest rate update date for tenant
    const { data: latestRate } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("fx_rates" as never)
      .select("date")
      .eq("tenant_id", user.tenant.id)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastUpdateDate = latestRate && typeof latestRate === "object" && "date" in latestRate 
      ? (latestRate as { date: string }).date 
      : null;
    
    return NextResponse.json({
      tenantId: user.tenant.id,
      lastUpdate: lastUpdateDate,
      isStale: lastUpdateDate
        ? new Date(lastUpdateDate) < new Date(Date.now() - 24 * 60 * 60 * 1000) // Older than 24 hours
        : true,
    });
  } catch (error) {
    console.error("Failed to check FX rate status:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to check status",
      },
      { status: 500 },
    );
  }
}

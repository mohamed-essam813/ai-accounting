/**
 * API Route for Monthly Depreciation
 * MVP Feedback: Automatic monthly depreciation journals
 * 
 * This endpoint can be called:
 * - Manually by users
 * - By a cron job/scheduler (e.g., Vercel Cron, Supabase Edge Functions)
 */

import { NextRequest, NextResponse } from "next/server";
import { processMonthlyDepreciation } from "@/lib/fixed-assets/depreciation";
import { getCurrentUser } from "@/lib/data/users";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get period from request body, or use current month
    const body = await request.json().catch(() => ({}));
    const periodStart = body.periodStart || getCurrentMonthStart();

    await processMonthlyDepreciation(periodStart);

    return NextResponse.json({
      success: true,
      message: `Depreciation processed for ${periodStart}`,
      periodStart,
    });
  } catch (error) {
    console.error("Failed to process depreciation:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process depreciation",
      },
      { status: 500 },
    );
  }
}

function getCurrentMonthStart(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}


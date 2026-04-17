import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/users";
import { listAccounts } from "@/lib/data/accounts";

/**
 * GET /api/chart-of-accounts
 *
 * Returns the tenant's chart of accounts as a flat JSON array.
 * Response is cached on the CDN edge for 60 s; clients may serve stale for
 * up to 5 minutes while revalidating in the background.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accounts = await listAccounts();

    const payload = accounts
      .filter((a) => a.is_active)
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        category: a.category ?? null,
      }))
      .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    console.error("[GET /api/chart-of-accounts]", e);
    return NextResponse.json({ error: "Failed to load chart of accounts" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/users";
import { autoCreateAccountAction } from "@/lib/actions/accounts";

const PostBodySchema = z.object({
  name: z.string().min(3),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  category: z.enum(["current", "non_current"]).nullable().optional(),
});

/**
 * POST /api/accounts — create chart-of-accounts row (same behavior as inline UI; requires session).
 * Prefer server actions from the app; this exists for integrations and API clients.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json: unknown = await request.json();
    const body = PostBodySchema.parse(json);
    const row = await autoCreateAccountAction(body.name.trim(), body.type, body.category ?? undefined);

    return NextResponse.json({
      account_id: row.id,
      name: row.name,
      code: row.code,
      type: row.type,
      tenant_id: user.tenant.id,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }
    console.error("[POST /api/accounts]", e);
    return NextResponse.json({ error: "Could not create account" }, { status: 500 });
  }
}
